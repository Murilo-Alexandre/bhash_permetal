import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeUploadedFileName } from '../common/upload-filename.util';

type UserSummary = {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  extension?: string | null;
  avatarUrl?: string | null;
  isGroupAdmin?: boolean;
  company?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
};

type OrgSummary = {
  id: string;
  name: string;
};

type BroadcastConfigInput = {
  title?: string;
  targetUserIds?: string[];
  automaticRules?: GroupAutomaticRuleInput[];
  companyIds?: string[];
  departmentIds?: string[];
  excludedUserIds?: string[];
  includeAllUsers?: boolean;
};

type GroupAutomaticRuleInput = {
  companyId?: string | null;
  departmentId?: string | null;
};

type GroupConfigInput = {
  title?: string;
  memberIds?: string[];
  automaticRules?: GroupAutomaticRuleInput[];
  companyIds?: string[];
  departmentIds?: string[];
  includeAllUsers?: boolean;
};

type GroupDepartureReason = 'LEFT' | 'REMOVED' | 'GROUP_DELETED';

type BroadcastConfigNormalized = {
  title: string;
  targetUserIds: string[];
  automaticRules: Array<{
    companyId: string | null;
    departmentId: string | null;
  }>;
  excludedUserIds: string[];
  includeAllUsers: boolean;
};

type AutomaticAudienceConfigNormalized = {
  rules: Array<{
    companyId: string | null;
    departmentId: string | null;
  }>;
  excludedUserIds: string[];
  includeAllUsers: boolean;
};

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAttachmentName(value?: string | null) {
    const normalized = normalizeUploadedFileName(value);
    return normalized || null;
  }

  private normalizePair(a: string, b: string) {
    return a < b ? [a, b] : [b, a];
  }

  private normalizeIds(values?: string[] | null) {
    return Array.from(
      new Set((values ?? []).map((value) => String(value ?? '').trim()).filter(Boolean)),
    );
  }

  private userSelect() {
    return {
      id: true,
      username: true,
      name: true,
      email: true,
      extension: true,
      avatarUrl: true,
      company: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    } as const;
  }

  private orgSelect() {
    return { id: true, name: true } as const;
  }

  private messageSelect(currentUserId: string) {
    return {
      id: true,
      createdAt: true,
      senderId: true,
      body: true,
      contentType: true,
      attachmentUrl: true,
      attachmentName: true,
      attachmentMime: true,
      attachmentSize: true,
      deletedAt: true,
      broadcastListId: true,
      broadcastListTitle: true,
      sender: { select: { id: true, username: true, name: true, avatarUrl: true } },
      favorites: {
        where: { userId: currentUserId },
        select: { id: true },
      },
      reactions: {
        select: {
          id: true,
          emoji: true,
          userId: true,
          user: { select: { id: true, name: true, username: true } },
        },
      },
    };
  }

  private currentMembershipWhere(userId: string) {
    return {
      OR: [
        { participants: { some: { userId } } },
        { userAId: userId },
        { userBId: userId },
      ],
    };
  }

  private accessibleMembershipWhere(userId: string) {
    return {
      OR: [
        this.currentMembershipWhere(userId),
        {
          kind: 'GROUP' as const,
          states: {
            some: {
              userId,
              hidden: false,
              leftAt: { not: null },
            },
          },
        },
        {
          kind: 'BROADCAST' as const,
          states: {
            some: {
              userId,
              hidden: false,
              leftAt: { not: null },
            },
          },
        },
      ],
    };
  }

  private includeConversationForUser(myId: string) {
    return {
      userA: { select: this.userSelect() },
      userB: { select: this.userSelect() },
      createdBy: { select: this.userSelect() },
      participants: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        select: {
          userId: true,
          isAdmin: true,
          user: { select: this.userSelect() },
        },
      },
      automaticRules: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        select: {
          id: true,
          companyId: true,
          departmentId: true,
          company: { select: this.orgSelect() },
          department: { select: this.orgSelect() },
        },
      },
      broadcastTargets: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        select: {
          userId: true,
          user: { select: this.userSelect() },
        },
      },
      broadcastCompanyTargets: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        select: {
          companyId: true,
          company: { select: this.orgSelect() },
        },
      },
      broadcastDepartmentTargets: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        select: {
          departmentId: true,
          department: { select: this.orgSelect() },
        },
      },
      broadcastExcludedUsers: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        select: {
          userId: true,
          user: { select: this.userSelect() },
        },
      },
      states: {
        where: { userId: myId },
        take: 1,
      },
    };
  }

  private rankTimestamp(conv: { sortAt?: string | Date; updatedAt?: string | Date; createdAt?: string | Date }) {
    const sort = conv.sortAt ? new Date(conv.sortAt).getTime() : 0;
    const updated = conv.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
    const created = conv.createdAt ? new Date(conv.createdAt).getTime() : 0;
    if (Number.isFinite(sort) && sort > 0) return sort;
    return Number.isFinite(updated) && updated > 0 ? updated : created;
  }

  private laterDate(a?: Date | string | null, b?: Date | string | null) {
    const aTime = a ? new Date(a).getTime() : 0;
    const bTime = b ? new Date(b).getTime() : 0;
    if (!aTime && !bTime) return null;
    return new Date(Math.max(aTime || 0, bTime || 0));
  }

  private visibleMessageDateWhere(state?: { clearedAt?: Date | null; leftAt?: Date | null } | null) {
    const createdAt: Record<string, Date> = {};
    if (state?.clearedAt) createdAt.gt = state.clearedAt;
    if (state?.leftAt) createdAt.lte = state.leftAt;
    return Object.keys(createdAt).length ? { createdAt } : {};
  }

  private dedupeUsers(items: Array<UserSummary | null | undefined>) {
    const out: UserSummary[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }

  private dedupeOrgs(items: Array<OrgSummary | null | undefined>) {
    const out: OrgSummary[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }

  private participantUsersFromConversation(conv: any) {
    const participantUsers = Array.isArray(conv?.participants)
      ? conv.participants.map((entry: any) =>
          entry?.user
            ? ({
                ...entry.user,
                isGroupAdmin: !!entry?.isAdmin,
              } as UserSummary)
            : undefined,
        )
      : [];

    return this.dedupeUsers([...participantUsers, conv?.userA ?? null, conv?.userB ?? null]);
  }

  private currentParticipantIdsFromConversation(conv: any) {
    return Array.from(
      new Set(
        [
          ...(Array.isArray(conv?.participants) ? conv.participants.map((entry: any) => entry?.userId) : []),
          conv?.userAId ?? null,
          conv?.userBId ?? null,
        ].filter((value): value is string => !!value),
      ),
    );
  }

  private groupAdminIdsFromConversation(conv: any) {
    if (conv?.kind !== 'GROUP') return [] as string[];
    return Array.from(
      new Set(
        (Array.isArray(conv?.participants) ? conv.participants : [])
          .filter((entry: any) => !!entry?.isAdmin)
          .map((entry: any) => String(entry?.userId ?? '').trim())
          .filter(Boolean),
      ),
    );
  }

  private groupAdminUsersFromConversation(conv: any) {
    const adminIdSet = new Set(this.groupAdminIdsFromConversation(conv));
    return this.participantUsersFromConversation(conv).filter((user) => adminIdSet.has(user.id));
  }

  private broadcastTargetsFromConversation(conv: any) {
    const users = Array.isArray(conv?.broadcastTargets)
      ? conv.broadcastTargets.map((entry: any) => entry?.user as UserSummary | undefined)
      : [];
    return this.dedupeUsers(users);
  }

  private broadcastCompaniesFromConversation(conv: any) {
    const items = Array.isArray(conv?.broadcastCompanyTargets)
      ? conv.broadcastCompanyTargets.map((entry: any) => entry?.company as OrgSummary | undefined)
      : [];
    return this.dedupeOrgs(items);
  }

  private broadcastDepartmentsFromConversation(conv: any) {
    const items = Array.isArray(conv?.broadcastDepartmentTargets)
      ? conv.broadcastDepartmentTargets.map((entry: any) => entry?.department as OrgSummary | undefined)
      : [];
    return this.dedupeOrgs(items);
  }

  private broadcastExcludedUsersFromConversation(conv: any) {
    const users = Array.isArray(conv?.broadcastExcludedUsers)
      ? conv.broadcastExcludedUsers.map((entry: any) => entry?.user as UserSummary | undefined)
      : [];
    return this.dedupeUsers(users);
  }

  private normalizeAutomaticRuleKey(companyId?: string | null, departmentId?: string | null) {
    return `${String(companyId ?? '').trim() || '*'}::${String(departmentId ?? '').trim() || '*'}`;
  }

  private groupAutomaticRulesFromConversation(conv: any) {
    const explicitRules = Array.isArray(conv?.automaticRules)
      ? conv.automaticRules
          .map((entry: any) => ({
            id: String(entry?.id ?? '').trim(),
            companyId: entry?.companyId ? String(entry.companyId).trim() : null,
            departmentId: entry?.departmentId ? String(entry.departmentId).trim() : null,
            company: (entry?.company as OrgSummary | undefined) ?? null,
            department: (entry?.department as OrgSummary | undefined) ?? null,
          }))
          .filter((rule) => !!rule.companyId || !!rule.departmentId)
      : [];

    if (explicitRules.length) {
      return explicitRules;
    }

    const legacyCompanies = Array.isArray(conv?.broadcastCompanyTargets)
      ? conv.broadcastCompanyTargets
          .map((entry: any) =>
            entry?.companyId
              ? ({
                  id: String(entry.companyId).trim(),
                  name: String(entry?.company?.name ?? '').trim(),
                } as OrgSummary)
              : null,
          )
          .filter((item: OrgSummary | null): item is OrgSummary => !!item?.id)
      : [];
    const legacyDepartments = Array.isArray(conv?.broadcastDepartmentTargets)
      ? conv.broadcastDepartmentTargets
          .map((entry: any) =>
            entry?.departmentId
              ? ({
                  id: String(entry.departmentId).trim(),
                  name: String(entry?.department?.name ?? '').trim(),
                } as OrgSummary)
              : null,
          )
          .filter((item: OrgSummary | null): item is OrgSummary => !!item?.id)
      : [];

    const companies = legacyCompanies.length ? legacyCompanies : [null];
    const departments = legacyDepartments.length ? legacyDepartments : [null];
    const rules = new Map<
      string,
      {
        id: string;
        companyId: string | null;
        departmentId: string | null;
        company: OrgSummary | null;
        department: OrgSummary | null;
      }
    >();

    for (const company of companies) {
      for (const department of departments) {
        if (!company?.id && !department?.id) continue;
        const key = this.normalizeAutomaticRuleKey(company?.id ?? null, department?.id ?? null);
        rules.set(key, {
          id: key,
          companyId: company?.id ?? null,
          departmentId: department?.id ?? null,
          company: company ?? null,
          department: department ?? null,
        });
      }
    }

    return Array.from(rules.values());
  }

  private async normalizeAutomaticAudienceConfig(
    myId: string,
    input?: {
      automaticRules?: GroupAutomaticRuleInput[];
      companyIds?: string[];
      departmentIds?: string[];
      excludedUserIds?: string[];
      includeAllUsers?: boolean;
    },
  ) {
    const rules = new Map<string, { companyId: string | null; departmentId: string | null }>();
    const explicitRules = Array.isArray(input?.automaticRules) ? input?.automaticRules : [];

    for (const rule of explicitRules) {
      const companyId = rule?.companyId ? String(rule.companyId).trim() : null;
      const departmentId = rule?.departmentId ? String(rule.departmentId).trim() : null;
      if (!companyId && !departmentId) continue;
      rules.set(this.normalizeAutomaticRuleKey(companyId, departmentId), {
        companyId,
        departmentId,
      });
    }

    if (!rules.size) {
      const companyIds = this.normalizeIds(input?.companyIds);
      const departmentIds = this.normalizeIds(input?.departmentIds);
      const legacyCompanies = companyIds.length ? companyIds : [null];
      const legacyDepartments = departmentIds.length ? departmentIds : [null];

      for (const companyId of legacyCompanies) {
        for (const departmentId of legacyDepartments) {
          if (!companyId && !departmentId) continue;
          rules.set(this.normalizeAutomaticRuleKey(companyId, departmentId), {
            companyId,
            departmentId,
          });
        }
      }
    }

    const normalized: AutomaticAudienceConfigNormalized = {
      rules: Array.from(rules.values()),
      excludedUserIds: this.normalizeIds(input?.excludedUserIds).filter((userId) => userId !== myId),
      includeAllUsers: !!input?.includeAllUsers,
    };

    await Promise.all([
      this.requireActiveUsers(normalized.excludedUserIds),
      this.requireCompanies(normalized.rules.map((rule) => rule.companyId).filter((value): value is string => !!value)),
      this.requireDepartments(
        normalized.rules.map((rule) => rule.departmentId).filter((value): value is string => !!value),
      ),
    ]);

    return normalized;
  }

  private userMatchesAutomaticAudience(
    user: { companyId?: string | null; departmentId?: string | null },
    config: Pick<AutomaticAudienceConfigNormalized, 'rules' | 'includeAllUsers'>,
  ) {
    if (config.includeAllUsers) return true;
    if (!config.rules.length) return false;
    return config.rules.some((rule) => {
      const companyOk = !rule.companyId || String(user.companyId ?? '') === rule.companyId;
      const departmentOk = !rule.departmentId || String(user.departmentId ?? '') === rule.departmentId;
      return companyOk && departmentOk;
    });
  }

  private async resolveAutomaticGroupUsersFromConfig(
    ownerId: string,
    config: Pick<AutomaticAudienceConfigNormalized, 'rules' | 'excludedUserIds' | 'includeAllUsers'>,
  ) {
    if (!config.includeAllUsers && !config.rules.length) return [] as UserSummary[];

    const dynamicUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: ownerId },
        ...(config.includeAllUsers
          ? null
          : {
              OR: config.rules.map((rule) => ({
                ...(rule.companyId ? { companyId: rule.companyId } : null),
                ...(rule.departmentId ? { departmentId: rule.departmentId } : null),
              })),
            }),
      },
      select: this.userSelect(),
      orderBy: [{ name: 'asc' }, { username: 'asc' }],
    });

    const excluded = new Set(config.excludedUserIds);
    return dynamicUsers.filter((user) => !excluded.has(user.id));
  }

  private directOtherUser(myId: string, conv: any) {
    return this.participantUsersFromConversation(conv).find((user) => user.id !== myId) ?? null;
  }

  private isCurrentParticipant(myId: string, conv: any) {
    return this.currentParticipantIdsFromConversation(conv).includes(myId);
  }

  private isGroupAdmin(myId: string, conv: any) {
    return conv?.kind === 'GROUP' && this.groupAdminIdsFromConversation(conv).includes(myId);
  }

  private requireGroupAdminPermission(myId: string, conv: any, actionLabel: string) {
    if (conv?.kind !== 'GROUP') {
      throw new BadRequestException('Ação disponível apenas para grupos');
    }
    if (!this.isGroupAdmin(myId, conv)) {
      throw new ForbiddenException(`Somente administradores do grupo podem ${actionLabel}`);
    }
  }

  private resolveConversationTitle(myId: string, conv: any) {
    if (conv.kind === 'DIRECT') {
      return this.directOtherUser(myId, conv)?.name ?? 'Nova conversa';
    }

    const explicit = String(conv.title ?? '').trim();
    if (explicit) return explicit;

    const names = this.participantUsersFromConversation(conv)
      .filter((user) => user.id !== myId)
      .map((user) => user.name)
      .filter(Boolean);

    if (conv.kind === 'GROUP') {
      return names.length ? names.join(', ') : 'Novo grupo';
    }

    return 'Nova lista';
  }

  private async ensureConversationParticipants(
    conversationId: string,
    userIds: string[],
    addedById?: string | null,
    opts?: { adminUserIds?: string[] },
  ) {
    const ids = this.normalizeIds(userIds);
    if (!ids.length) return;
    const adminIdSet = new Set(this.normalizeIds(opts?.adminUserIds));

    await this.prisma.conversationParticipant.createMany({
      data: ids.map((userId) => ({
        id: randomUUID(),
        conversationId,
        userId,
        addedById: addedById ?? null,
        isAdmin: adminIdSet.has(userId),
      })),
      skipDuplicates: true,
    });
  }

  private async clearGroupAutomaticAudience(conversationId: string, tx: any) {
    await Promise.all([
      tx.conversation.update({
        where: { id: conversationId },
        data: { broadcastIncludeAllUsers: false },
      }),
      tx.conversationAutomaticRule.deleteMany({ where: { conversationId } }),
      tx.conversationBroadcastTarget.deleteMany({ where: { conversationId } }),
      tx.conversationBroadcastCompany.deleteMany({ where: { conversationId } }),
      tx.conversationBroadcastDepartment.deleteMany({ where: { conversationId } }),
      tx.conversationBroadcastExcludedUser.deleteMany({ where: { conversationId } }),
    ]);
  }

  private async deactivateGroupParticipantIds(
    conversationId: string,
    userIds: string[],
    automaticAudience: AutomaticAudienceConfigNormalized,
    reason: GroupDepartureReason,
    tx: any,
  ) {
    const ids = this.normalizeIds(userIds);
    if (!ids.length) return;

    const leftAt = new Date();
    await Promise.all([
      tx.conversationParticipant.deleteMany({
        where: { conversationId, userId: { in: ids } },
      }),
      ...ids.map((userId) =>
        tx.conversationUserState.upsert({
          where: { conversationId_userId: { conversationId, userId } },
          update: {
            hidden: false,
            leftAt,
            leftReason: reason,
            lastReadAt: leftAt,
          },
          create: {
            conversationId,
            userId,
            hidden: false,
            leftAt,
            leftReason: reason,
            lastReadAt: leftAt,
          },
        }),
      ),
    ]);

    if (this.hasAutomaticAudienceConfig(automaticAudience)) {
      await Promise.all(
        ids.map((userId) =>
          tx.conversationBroadcastExcludedUser.upsert({
            where: { conversationId_userId: { conversationId, userId } },
            update: {},
            create: {
              id: randomUUID(),
              conversationId,
              userId,
            },
          }),
        ),
      );
    }
  }

  private async ensureVisibleStates(
    conversationId: string,
    participantIds: string[],
    currentUserId?: string | null,
  ) {
    const uniqueIds = this.normalizeIds(participantIds);
    if (!uniqueIds.length) return;

    const now = new Date();
    await this.prisma.$transaction(
      uniqueIds.map((participantId) =>
        this.prisma.conversationUserState.upsert({
          where: {
            conversationId_userId: {
              conversationId,
              userId: participantId,
            },
          },
          update:
            participantId === currentUserId
              ? { hidden: false, leftAt: null, leftReason: null, lastReadAt: now }
              : { hidden: false, leftAt: null, leftReason: null },
          create:
            participantId === currentUserId
              ? {
                  conversationId,
                  userId: participantId,
                  hidden: false,
                  leftAt: null,
                  leftReason: null,
                  lastReadAt: now,
                }
              : {
                  conversationId,
                  userId: participantId,
                  hidden: false,
                  leftAt: null,
                  leftReason: null,
                },
        }),
      ),
    );
  }

  private async requireActiveUsers(userIds: string[]) {
    const ids = this.normalizeIds(userIds);
    if (!ids.length) return [] as UserSummary[];

    const items = await this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: this.userSelect(),
    });

    if (items.length !== ids.length) {
      throw new BadRequestException('Há usuários inválidos ou inativos na seleção');
    }

    return items;
  }

  private async requireCompanies(companyIds: string[]) {
    const ids = this.normalizeIds(companyIds);
    if (!ids.length) return [] as OrgSummary[];

    const items = await this.prisma.company.findMany({
      where: { id: { in: ids } },
      select: this.orgSelect(),
    });

    if (items.length !== ids.length) {
      throw new BadRequestException('Há empresas inválidas na lista');
    }

    return items;
  }

  private async requireDepartments(departmentIds: string[]) {
    const ids = this.normalizeIds(departmentIds);
    if (!ids.length) return [] as OrgSummary[];

    const items = await this.prisma.department.findMany({
      where: { id: { in: ids } },
      select: this.orgSelect(),
    });

    if (items.length !== ids.length) {
      throw new BadRequestException('Há setores inválidos na lista');
    }

    return items;
  }

  private async normalizeBroadcastConfig(
    myId: string,
    input: BroadcastConfigInput,
    opts?: { requireTitle?: boolean },
  ) {
    const automaticAudience = await this.normalizeAutomaticAudienceConfig(myId, {
      automaticRules: input?.automaticRules,
      companyIds: input?.companyIds,
      departmentIds: input?.departmentIds,
      excludedUserIds: input?.excludedUserIds,
      includeAllUsers: input?.includeAllUsers,
    });

    const normalized: BroadcastConfigNormalized = {
      title: String(input?.title ?? '').trim(),
      targetUserIds: this.normalizeIds(input?.targetUserIds).filter((userId) => userId !== myId),
      automaticRules: automaticAudience.rules,
      excludedUserIds: automaticAudience.excludedUserIds,
      includeAllUsers: automaticAudience.includeAllUsers,
    };

    if (opts?.requireTitle && normalized.title.length < 2) {
      throw new BadRequestException('Informe um nome para a lista de transmissão');
    }

    await this.requireActiveUsers(normalized.targetUserIds);

    const effectiveTargets = await this.resolveBroadcastAudienceUsersFromConfig(myId, normalized);
    if (!effectiveTargets.length) {
      throw new BadRequestException('Selecione pelo menos um contato válido para a lista');
    }

    return normalized;
  }

  private hasAutomaticAudienceConfig(
    config?: Pick<AutomaticAudienceConfigNormalized, 'rules' | 'includeAllUsers'> | null,
  ) {
    return !!config?.includeAllUsers || !!config?.rules?.length;
  }

  private async replaceGroupAutomaticAudience(
    conversationId: string,
    config: AutomaticAudienceConfigNormalized,
    tx: any,
  ) {
    await Promise.all([
      tx.conversation.update({
        where: { id: conversationId },
        data: { broadcastIncludeAllUsers: config.includeAllUsers },
      }),
      tx.conversationAutomaticRule.deleteMany({ where: { conversationId } }),
      tx.conversationBroadcastCompany.deleteMany({ where: { conversationId } }),
      tx.conversationBroadcastDepartment.deleteMany({ where: { conversationId } }),
      ...(config.rules.length
        ? [
            tx.conversationAutomaticRule.createMany({
              data: config.rules.map((rule) => ({
                id: randomUUID(),
                conversationId,
                companyId: rule.companyId,
                departmentId: rule.departmentId,
              })),
            }),
          ]
        : []),
    ]);
  }

  private automaticAudienceConfigFromConversation(conv: any): AutomaticAudienceConfigNormalized {
    return {
      includeAllUsers: !!conv?.broadcastIncludeAllUsers,
      rules: this.groupAutomaticRulesFromConversation(conv).map((rule) => ({
        companyId: rule.companyId,
        departmentId: rule.departmentId,
      })),
      excludedUserIds: Array.isArray(conv?.broadcastExcludedUsers)
        ? conv.broadcastExcludedUsers.map((entry: any) => String(entry?.userId ?? '')).filter(Boolean)
        : [],
    };
  }

  private async resolveBroadcastAudienceUsersFromConfig(
    ownerId: string,
    config: Pick<
      BroadcastConfigNormalized,
      'targetUserIds' | 'automaticRules' | 'excludedUserIds' | 'includeAllUsers'
    > & {
      companyIds?: string[];
      departmentIds?: string[];
    },
  ) {
    const explicitUsers = await this.requireActiveUsers(config.targetUserIds);
    const out = new Map<string, UserSummary>();
    const automaticAudience = await this.normalizeAutomaticAudienceConfig(ownerId, {
      automaticRules: config.automaticRules,
      companyIds: config.companyIds,
      departmentIds: config.departmentIds,
      excludedUserIds: config.excludedUserIds,
      includeAllUsers: config.includeAllUsers,
    });

    for (const user of explicitUsers) {
      if (user.id !== ownerId) out.set(user.id, user);
    }

    if (automaticAudience.includeAllUsers || automaticAudience.rules.length) {
      const dynamicUsers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          id: { not: ownerId },
          ...(automaticAudience.includeAllUsers
            ? null
            : {
                OR: automaticAudience.rules.map((rule) => ({
                  ...(rule.companyId ? { companyId: rule.companyId } : null),
                  ...(rule.departmentId ? { departmentId: rule.departmentId } : null),
                })),
              }),
        },
        select: this.userSelect(),
        orderBy: [{ name: 'asc' }, { username: 'asc' }],
      });

      for (const user of dynamicUsers) out.set(user.id, user);
    }

    for (const excludedUserId of automaticAudience.excludedUserIds) {
      out.delete(excludedUserId);
    }

    return Array.from(out.values());
  }

  private async resolveEffectiveBroadcastUsersFromConversation(conv: any) {
    if (conv?.kind !== 'BROADCAST') return [] as UserSummary[];
    return this.resolveBroadcastAudienceUsersFromConfig(conv.createdById ?? '', {
      includeAllUsers: !!conv.broadcastIncludeAllUsers,
      targetUserIds: Array.isArray(conv?.broadcastTargets)
        ? conv.broadcastTargets.map((entry: any) => String(entry?.userId ?? '')).filter(Boolean)
        : [],
      automaticRules: this.groupAutomaticRulesFromConversation(conv).map((rule) => ({
        companyId: rule.companyId,
        departmentId: rule.departmentId,
      })),
      excludedUserIds: Array.isArray(conv?.broadcastExcludedUsers)
        ? conv.broadcastExcludedUsers.map((entry: any) => String(entry?.userId ?? '')).filter(Boolean)
        : [],
    });
  }

  private async replaceBroadcastAudience(
    conversationId: string,
    config: BroadcastConfigNormalized,
    tx: any,
  ) {
    await Promise.all([
      tx.conversationBroadcastTarget.deleteMany({ where: { conversationId } }),
      tx.conversationAutomaticRule.deleteMany({ where: { conversationId } }),
      tx.conversationBroadcastCompany.deleteMany({ where: { conversationId } }),
      tx.conversationBroadcastDepartment.deleteMany({ where: { conversationId } }),
      tx.conversationBroadcastExcludedUser.deleteMany({ where: { conversationId } }),
    ]);

    if (config.targetUserIds.length) {
      await tx.conversationBroadcastTarget.createMany({
        data: config.targetUserIds.map((userId) => ({
          id: randomUUID(),
          conversationId,
          userId,
        })),
        skipDuplicates: true,
      });
    }

    if (config.automaticRules.length) {
      await tx.conversationAutomaticRule.createMany({
        data: config.automaticRules.map((rule) => ({
          id: randomUUID(),
          conversationId,
          companyId: rule.companyId,
          departmentId: rule.departmentId,
        })),
        skipDuplicates: true,
      });
    }

    if (config.excludedUserIds.length) {
      await tx.conversationBroadcastExcludedUser.createMany({
        data: config.excludedUserIds.map((userId) => ({
          id: randomUUID(),
          conversationId,
          userId,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async mapConversationListItem(
    myId: string,
    conv: any,
    opts?: { effectiveBroadcastTargets?: UserSummary[]; includeBroadcastAudienceDetails?: boolean },
  ) {
    const state = (conv.states?.[0] as any) ?? null;
    const pinned = !!state?.pinned;
    const unreadFrom = this.laterDate(state?.lastReadAt, state?.clearedAt);
    const visibleDateWhere = this.visibleMessageDateWhere(state);

    const lastMessage = await this.prisma.message.findFirst({
      where: {
        conversationId: conv.id,
        hiddenForUsers: { none: { userId: myId } },
        ...visibleDateWhere,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: this.messageSelect(myId),
    });

    const rankMessage =
      conv.kind === 'DIRECT'
        ? await this.prisma.message.findFirst({
            where: {
              conversationId: conv.id,
              hiddenForUsers: { none: { userId: myId } },
              NOT: {
                senderId: myId,
                broadcastListId: { not: null },
              },
              ...visibleDateWhere,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { createdAt: true },
          })
        : null;

    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId: conv.id,
        senderId: { not: myId },
        hiddenForUsers: { none: { userId: myId } },
        ...(unreadFrom
          ? { createdAt: { gt: unreadFrom, ...(state?.leftAt ? { lte: state.leftAt } : {}) } }
          : visibleDateWhere),
      },
    });

    const participants = this.participantUsersFromConversation(conv);
    const groupAdmins = this.groupAdminUsersFromConversation(conv);
    const otherUser = conv.kind === 'DIRECT' ? this.directOtherUser(myId, conv) : null;
    const explicitBroadcastTargets = this.broadcastTargetsFromConversation(conv);
    const effectiveBroadcastTargets =
      opts?.effectiveBroadcastTargets ??
      (conv.kind === 'BROADCAST' ? await this.resolveEffectiveBroadcastUsersFromConversation(conv) : []);

    return {
      id: conv.id,
      kind: conv.kind,
      title: this.resolveConversationTitle(myId, conv),
      rawTitle: conv.title ?? null,
      avatarUrl: conv.avatarUrl ?? null,
      createdAt: conv.createdAt,
      updatedAt: lastMessage?.createdAt ?? conv.updatedAt ?? conv.createdAt,
      sortAt:
        conv.kind === 'DIRECT'
          ? rankMessage?.createdAt ?? conv.createdAt
          : lastMessage?.createdAt ?? conv.updatedAt ?? conv.createdAt,
      createdById: conv.createdById ?? null,
      createdBy: conv.createdBy ?? null,
      otherUser,
      participants,
      groupAdmins,
      automaticRules: conv.kind === 'DIRECT' ? [] : this.groupAutomaticRulesFromConversation(conv),
      participantCount: participants.length,
      broadcastTargets: explicitBroadcastTargets,
      targetCount: effectiveBroadcastTargets.length,
      pinned,
      unreadCount,
      isCurrentParticipant: this.isCurrentParticipant(myId, conv),
      isGroupAdmin: this.isGroupAdmin(myId, conv),
      leftAt: state?.leftAt ?? null,
      leftReason: state?.leftReason ?? null,
      broadcastIncludeAllUsers: !!conv.broadcastIncludeAllUsers,
      ...(opts?.includeBroadcastAudienceDetails
        ? {
            effectiveBroadcastTargets,
            broadcastTargetCompanies: this.broadcastCompaniesFromConversation(conv),
            broadcastTargetDepartments: this.broadcastDepartmentsFromConversation(conv),
            broadcastExcludedUsers: this.broadcastExcludedUsersFromConversation(conv),
          }
        : null),
      lastMessage: lastMessage
        ? {
            ...lastMessage,
            attachmentName: this.normalizeAttachmentName(lastMessage.attachmentName),
            isFavorited: lastMessage.favorites.length > 0,
            broadcastSource:
              lastMessage.broadcastListId && lastMessage.broadcastListTitle
                ? {
                    id: lastMessage.broadcastListId,
                    title: lastMessage.broadcastListTitle,
                  }
                : null,
          }
        : null,
    };
  }

  private async findAccessibleConversationForUser(myId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        AND: [this.accessibleMembershipWhere(myId)],
      },
      include: this.includeConversationForUser(myId),
    });

    if (!conv) throw new BadRequestException('Conversa não encontrada');
    return conv;
  }

  private async findCurrentConversationForUser(myId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        AND: [this.currentMembershipWhere(myId)],
      },
      include: this.includeConversationForUser(myId),
    });

    if (!conv) throw new BadRequestException('Conversa não encontrada');
    return conv;
  }

  private async serializeConversationForUser(
    myId: string,
    conversationId: string,
    opts?: { includeBroadcastAudienceDetails?: boolean; includeAvailableBroadcastUsers?: boolean },
  ) {
    const conv = await this.findAccessibleConversationForUser(myId, conversationId);
    const effectiveBroadcastTargets =
      conv.kind === 'BROADCAST' ? await this.resolveEffectiveBroadcastUsersFromConversation(conv) : [];
    const conversation = await this.mapConversationListItem(myId, conv, {
      effectiveBroadcastTargets,
      includeBroadcastAudienceDetails: !!opts?.includeBroadcastAudienceDetails,
    });

    if (!opts?.includeBroadcastAudienceDetails || conv.kind !== 'BROADCAST') {
      return conversation;
    }

    const includedUserIds = new Set(effectiveBroadcastTargets.map((user) => user.id));
    const availableBroadcastUsers = opts?.includeAvailableBroadcastUsers
      ? await this.prisma.user.findMany({
          where: {
            isActive: true,
            id: {
              not: myId,
              notIn: Array.from(includedUserIds),
            },
          },
          orderBy: [{ name: 'asc' }, { username: 'asc' }],
          select: this.userSelect(),
        })
      : [];

    return {
      ...conversation,
      availableBroadcastUsers,
    };
  }

  async assertMember(myId: string, conversationId: string) {
    return this.findAccessibleConversationForUser(myId, conversationId);
  }

  async assertCurrentParticipant(myId: string, conversationId: string) {
    return this.findCurrentConversationForUser(myId, conversationId);
  }

  async getOrCreateDirect(myId: string, otherUserId: string) {
    if (!otherUserId || otherUserId === myId) {
      throw new BadRequestException('otherUserId inválido');
    }

    await this.requireActiveUsers([otherUserId]);

    const [userAId, userBId] = this.normalizePair(myId, otherUserId);

    const conv = await this.prisma.conversation.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      update: {
        kind: 'DIRECT',
        title: null,
        avatarUrl: null,
      },
      create: {
        kind: 'DIRECT',
        userAId,
        userBId,
      },
      select: { id: true },
    });

    await this.ensureConversationParticipants(conv.id, [userAId, userBId], myId);
    await this.prisma.conversationUserState.upsert({
      where: { conversationId_userId: { conversationId: conv.id, userId: myId } },
      update: { hidden: false, leftAt: null, leftReason: null },
      create: { conversationId: conv.id, userId: myId, hidden: false, leftAt: null, leftReason: null },
    });

    return {
      ok: true,
      conversation: await this.serializeConversationForUser(myId, conv.id),
    };
  }

  async createGroup(myId: string, input: GroupConfigInput) {
    const normalizedTitle = String(input?.title ?? '').trim();
    if (normalizedTitle.length < 2) {
      throw new BadRequestException('Informe um nome para o grupo');
    }

    const uniqueMembers = this.normalizeIds(input?.memberIds).filter((value) => value !== myId);
    const automaticAudience = await this.normalizeAutomaticAudienceConfig(myId, {
      automaticRules: input?.automaticRules,
      companyIds: input?.companyIds,
      departmentIds: input?.departmentIds,
      includeAllUsers: input?.includeAllUsers,
      excludedUserIds: [],
    });

    const automaticMembers = this.hasAutomaticAudienceConfig(automaticAudience)
      ? await this.resolveAutomaticGroupUsersFromConfig(myId, automaticAudience)
      : [];

    if (!uniqueMembers.length && !automaticMembers.length) {
      throw new BadRequestException('Selecione pelo menos uma pessoa para o grupo');
    }

    await this.requireActiveUsers(uniqueMembers);
    const participantIds = this.normalizeIds([
      myId,
      ...uniqueMembers,
      ...automaticMembers.map((user) => user.id),
    ]);

    const conv = await this.prisma.conversation.create({
      data: {
        id: randomUUID(),
        kind: 'GROUP',
        title: normalizedTitle,
        createdById: myId,
        broadcastIncludeAllUsers: automaticAudience.includeAllUsers,
      },
      select: { id: true },
    });

    await this.ensureConversationParticipants(conv.id, participantIds, myId, { adminUserIds: [myId] });
    await this.ensureVisibleStates(conv.id, participantIds, myId);
    if (this.hasAutomaticAudienceConfig(automaticAudience)) {
      await this.replaceGroupAutomaticAudience(conv.id, automaticAudience, this.prisma);
    }

    return {
      ok: true,
      conversation: await this.serializeConversationForUser(myId, conv.id),
      participantIds,
    };
  }

  async createBroadcastList(myId: string, input: BroadcastConfigInput) {
    const config = await this.normalizeBroadcastConfig(myId, input, { requireTitle: true });

    const conv = await this.prisma.conversation.create({
      data: {
        id: randomUUID(),
        kind: 'BROADCAST',
        title: config.title,
        createdById: myId,
        broadcastIncludeAllUsers: config.includeAllUsers,
      },
      select: { id: true },
    });

    await this.ensureConversationParticipants(conv.id, [myId], myId);
    await this.ensureVisibleStates(conv.id, [myId], myId);
    await this.replaceBroadcastAudience(conv.id, config, this.prisma);

    return {
      ok: true,
      conversation: await this.serializeConversationForUser(myId, conv.id),
    };
  }

  async updateBroadcastList(myId: string, conversationId: string, input: BroadcastConfigInput) {
    const conv = await this.assertCurrentParticipant(myId, conversationId);
    if (conv.kind !== 'BROADCAST') {
      throw new BadRequestException('Somente listas de transmissão podem ser editadas');
    }
    if (conv.createdById !== myId) {
      throw new ForbiddenException('Somente quem criou a lista pode editá-la');
    }

    const config = await this.normalizeBroadcastConfig(myId, input, { requireTitle: true });

    await this.prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          title: config.title,
          broadcastIncludeAllUsers: config.includeAllUsers,
        },
      });

      await this.replaceBroadcastAudience(conversationId, config, tx);
    });

    return {
      ok: true,
      conversation: await this.serializeConversationForUser(myId, conversationId, {
        includeBroadcastAudienceDetails: true,
        includeAvailableBroadcastUsers: true,
      }),
    };
  }

  async deleteBroadcastList(myId: string, conversationId: string) {
    const conv = await this.assertCurrentParticipant(myId, conversationId);
    if (conv.kind !== 'BROADCAST') {
      throw new BadRequestException('Somente listas de transmissão podem ser excluídas');
    }
    if (conv.createdById !== myId) {
      throw new ForbiddenException('Somente quem criou a lista pode excluí-la');
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await Promise.all([
        tx.conversation.update({
          where: { id: conversationId },
          data: { broadcastIncludeAllUsers: false },
        }),
        tx.conversationParticipant.deleteMany({
          where: { conversationId, userId: myId },
        }),
        tx.conversationAutomaticRule.deleteMany({ where: { conversationId } }),
        tx.conversationBroadcastTarget.deleteMany({ where: { conversationId } }),
        tx.conversationBroadcastCompany.deleteMany({ where: { conversationId } }),
        tx.conversationBroadcastDepartment.deleteMany({ where: { conversationId } }),
        tx.conversationBroadcastExcludedUser.deleteMany({ where: { conversationId } }),
        tx.conversationUserState.upsert({
          where: { conversationId_userId: { conversationId, userId: myId } },
          update: { hidden: false, leftAt: now, leftReason: 'GROUP_DELETED', lastReadAt: now },
          create: { conversationId, userId: myId, hidden: false, leftAt: now, leftReason: 'GROUP_DELETED', lastReadAt: now },
        }),
      ]);
    });

    return {
      ok: true,
      conversationId,
      conversation: await this.serializeConversationForUser(myId, conversationId, {
        includeBroadcastAudienceDetails: true,
        includeAvailableBroadcastUsers: true,
      }),
    };
  }

  async getDetails(myId: string, conversationId: string) {
    const conv = await this.findAccessibleConversationForUser(myId, conversationId);
    if (conv.kind === 'BROADCAST' && conv.createdById !== myId) {
      throw new ForbiddenException('Somente quem criou a lista pode ver esses dados');
    }

    return {
      ok: true,
      conversation: await this.serializeConversationForUser(myId, conversationId, {
        includeBroadcastAudienceDetails: conv.kind === 'BROADCAST',
        includeAvailableBroadcastUsers: conv.kind === 'BROADCAST',
      }),
    };
  }

  async addGroupParticipants(
    myId: string,
    conversationId: string,
    input: {
      userIds?: string[];
      automaticRules?: GroupAutomaticRuleInput[];
      companyIds?: string[];
      departmentIds?: string[];
      includeAllUsers?: boolean;
    },
  ) {
    const conv = await this.assertCurrentParticipant(myId, conversationId);
    if (conv.kind !== 'GROUP') {
      throw new BadRequestException('Somente grupos aceitam novos participantes');
    }
    this.requireGroupAdminPermission(myId, conv, 'adicionar pessoas');

    const existingIds = new Set(this.participantUsersFromConversation(conv).map((user) => user.id));
    const normalizedManualIds = this.normalizeIds(input?.userIds).filter((value) => value && !existingIds.has(value));
    const automaticAudience = await this.normalizeAutomaticAudienceConfig(myId, {
      automaticRules: input?.automaticRules,
      companyIds: input?.companyIds,
      departmentIds: input?.departmentIds,
      includeAllUsers: input?.includeAllUsers,
      excludedUserIds: this.automaticAudienceConfigFromConversation(conv).excludedUserIds,
    });
    const automaticMemberIds = this.hasAutomaticAudienceConfig(automaticAudience)
      ? (
          await this.resolveAutomaticGroupUsersFromConfig(myId, automaticAudience)
        )
          .map((user) => user.id)
          .filter((userId) => !existingIds.has(userId))
      : [];
    const newIds = this.normalizeIds([...normalizedManualIds, ...automaticMemberIds]).filter(
      (value) => value && !existingIds.has(value),
    );

    if (!newIds.length && !('automaticRules' in (input ?? {})) && !('includeAllUsers' in (input ?? {}))) {
      return {
        ok: true,
        conversation: await this.serializeConversationForUser(myId, conversationId),
        participantIds: existingIds.size ? Array.from(existingIds) : [myId],
      };
    }

    await this.requireActiveUsers(newIds);
    const participantIds = [...existingIds, ...newIds];

    if ('automaticRules' in (input ?? {}) || 'includeAllUsers' in (input ?? {})) {
      await this.prisma.$transaction(async (tx) => {
        await this.replaceGroupAutomaticAudience(conversationId, automaticAudience, tx);
      });
    }

    if (newIds.length) {
      await Promise.all([
        this.ensureConversationParticipants(conversationId, newIds, myId),
        this.ensureVisibleStates(conversationId, newIds),
        this.prisma.conversationBroadcastExcludedUser.deleteMany({
          where: { conversationId, userId: { in: newIds } },
        }),
      ]);
    }

    return {
      ok: true,
      conversation: await this.serializeConversationForUser(myId, conversationId),
      participantIds,
      addedUserIds: newIds,
    };
  }

  async leaveGroup(myId: string, conversationId: string) {
    const conv = await this.assertCurrentParticipant(myId, conversationId);
    if (conv.kind !== 'GROUP') {
      throw new BadRequestException('Somente grupos podem ser deixados');
    }

    const automaticAudience = this.automaticAudienceConfigFromConversation(conv);
    const currentParticipantIds = this.currentParticipantIdsFromConversation(conv);
    const remainingParticipantIds = currentParticipantIds.filter((userId) => userId !== myId);
    const remainingAdminIds = this.groupAdminIdsFromConversation(conv).filter((userId) => userId !== myId);

    if (this.isGroupAdmin(myId, conv) && remainingParticipantIds.length > 0 && remainingAdminIds.length === 0) {
      throw new BadRequestException('Promova outro participante como admin antes de sair do grupo');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.deactivateGroupParticipantIds(conversationId, [myId], automaticAudience, 'LEFT', tx);
      if (!remainingParticipantIds.length) {
        await this.clearGroupAutomaticAudience(conversationId, tx);
      }
    });

    return {
      ok: true,
      conversationId,
      conversation: await this.serializeConversationForUser(myId, conversationId),
      remainingParticipantIds,
    };
  }

  async setGroupAdmin(myId: string, conversationId: string, targetUserId: string, isAdmin: boolean) {
    const conv = await this.assertCurrentParticipant(myId, conversationId);
    if (conv.kind !== 'GROUP') {
      throw new BadRequestException('Somente grupos possuem administradores');
    }
    this.requireGroupAdminPermission(myId, conv, 'gerenciar administradores do grupo');

    const normalizedTargetUserId = String(targetUserId ?? '').trim();
    if (!normalizedTargetUserId) {
      throw new BadRequestException('Participante inválido');
    }

    const participantIds = this.currentParticipantIdsFromConversation(conv);
    if (!participantIds.includes(normalizedTargetUserId)) {
      throw new BadRequestException('Esse usuário não faz mais parte do grupo');
    }

    const nextAdminIds = new Set(this.groupAdminIdsFromConversation(conv));
    if (isAdmin) {
      nextAdminIds.add(normalizedTargetUserId);
    } else {
      nextAdminIds.delete(normalizedTargetUserId);
    }

    if (!nextAdminIds.size && participantIds.length > 0) {
      throw new BadRequestException('O grupo precisa ter pelo menos um administrador');
    }

    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: normalizedTargetUserId,
        },
      },
      data: { isAdmin: !!isAdmin },
    });

    return {
      ok: true,
      conversation: await this.serializeConversationForUser(myId, conversationId),
      participantIds,
    };
  }

  async removeGroupParticipant(myId: string, conversationId: string, targetUserId: string) {
    const conv = await this.assertCurrentParticipant(myId, conversationId);
    if (conv.kind !== 'GROUP') {
      throw new BadRequestException('Somente grupos permitem remover participantes');
    }
    this.requireGroupAdminPermission(myId, conv, 'remover pessoas do grupo');

    const normalizedTargetUserId = String(targetUserId ?? '').trim();
    if (!normalizedTargetUserId || normalizedTargetUserId === myId) {
      throw new BadRequestException('Use a opção de sair do grupo para remover você mesmo');
    }

    const participantIds = this.currentParticipantIdsFromConversation(conv);
    if (!participantIds.includes(normalizedTargetUserId)) {
      throw new BadRequestException('Esse usuário não faz mais parte do grupo');
    }

    const remainingParticipantIds = participantIds.filter((userId) => userId !== normalizedTargetUserId);
    const remainingAdminIds = this.groupAdminIdsFromConversation(conv).filter((userId) => userId !== normalizedTargetUserId);
    if (remainingParticipantIds.length > 0 && remainingAdminIds.length === 0) {
      throw new BadRequestException('Promova outro participante como admin antes de remover esse usuário');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.deactivateGroupParticipantIds(
        conversationId,
        [normalizedTargetUserId],
        this.automaticAudienceConfigFromConversation(conv),
        'REMOVED',
        tx,
      );
    });

    return {
      ok: true,
      conversationId,
      conversation: await this.serializeConversationForUser(myId, conversationId),
      participantIds: remainingParticipantIds,
      removedUserId: normalizedTargetUserId,
    };
  }

  async deleteGroup(myId: string, conversationId: string) {
    const conv = await this.assertCurrentParticipant(myId, conversationId);
    if (conv.kind !== 'GROUP') {
      throw new BadRequestException('Somente grupos podem ser excluídos');
    }
    this.requireGroupAdminPermission(myId, conv, 'excluir o grupo');

    const participantIds = this.currentParticipantIdsFromConversation(conv);
    await this.prisma.$transaction(async (tx) => {
      await this.deactivateGroupParticipantIds(
        conversationId,
        participantIds,
        this.automaticAudienceConfigFromConversation(conv),
        'GROUP_DELETED',
        tx,
      );
      await this.clearGroupAutomaticAudience(conversationId, tx);
    });

    return {
      ok: true,
      conversationId,
      conversation: await this.serializeConversationForUser(myId, conversationId),
      participantIds,
    };
  }

  async syncAutomaticGroupMembershipsForUser(userId: string) {
    const normalizedUserId = String(userId ?? '').trim();
    if (!normalizedUserId) return [] as Array<{ conversationId: string; participantIds: string[] }>;

    const user = await this.prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: {
        id: true,
        isActive: true,
        companyId: true,
        departmentId: true,
      },
    });
    if (!user?.isActive) return [] as Array<{ conversationId: string; participantIds: string[] }>;

    const groupWhere: any = {
      kind: 'GROUP',
      OR: [
        { broadcastIncludeAllUsers: true },
        { automaticRules: { some: {} } },
        ...(user.companyId ? [{ broadcastCompanyTargets: { some: { companyId: user.companyId } } }] : []),
        ...(user.departmentId
          ? [{ broadcastDepartmentTargets: { some: { departmentId: user.departmentId } } }]
          : []),
      ],
    };
    if (!groupWhere.OR.length) return [] as Array<{ conversationId: string; participantIds: string[] }>;

    const groups = await this.prisma.conversation.findMany({
      where: groupWhere,
      select: {
        id: true,
        createdById: true,
        broadcastIncludeAllUsers: true,
        automaticRules: {
          select: {
            id: true,
            companyId: true,
            departmentId: true,
          },
        },
        broadcastCompanyTargets: { select: { companyId: true } },
        broadcastDepartmentTargets: { select: { departmentId: true } },
        broadcastExcludedUsers: { select: { userId: true } },
        participants: { select: { userId: true } },
        states: {
          where: { userId: normalizedUserId },
          take: 1,
          select: { leftAt: true },
        },
      },
    });

    const synced: Array<{ conversationId: string; participantIds: string[] }> = [];
    for (const group of groups) {
      const automaticAudience = this.automaticAudienceConfigFromConversation(group);
      if (!this.hasAutomaticAudienceConfig(automaticAudience)) continue;
      if (automaticAudience.excludedUserIds.includes(normalizedUserId)) continue;
      if (group.participants.some((participant) => participant.userId === normalizedUserId)) continue;
      if (group.states?.[0]?.leftAt) continue;

      if (!this.userMatchesAutomaticAudience(user, automaticAudience)) continue;

      await this.ensureConversationParticipants(group.id, [normalizedUserId], group.createdById ?? null);
      await this.ensureVisibleStates(group.id, [normalizedUserId]);

      synced.push({
        conversationId: group.id,
        participantIds: this.normalizeIds([
          ...group.participants.map((participant) => participant.userId),
          normalizedUserId,
        ]),
      });
    }

    return synced;
  }

  async listMine(myId: string, q?: string) {
    const query = (q ?? '').trim();
    const queryFilter = query
      ? {
          OR: [
            { title: { contains: query, mode: 'insensitive' as const } },
            { userA: { name: { contains: query, mode: 'insensitive' as const } } },
            { userA: { username: { contains: query, mode: 'insensitive' as const } } },
            { userA: { email: { contains: query, mode: 'insensitive' as const } } },
            { userB: { name: { contains: query, mode: 'insensitive' as const } } },
            { userB: { username: { contains: query, mode: 'insensitive' as const } } },
            { userB: { email: { contains: query, mode: 'insensitive' as const } } },
            { participants: { some: { user: { name: { contains: query, mode: 'insensitive' as const } } } } },
            { participants: { some: { user: { username: { contains: query, mode: 'insensitive' as const } } } } },
            { participants: { some: { user: { email: { contains: query, mode: 'insensitive' as const } } } } },
            { broadcastTargets: { some: { user: { name: { contains: query, mode: 'insensitive' as const } } } } },
            { createdBy: { name: { contains: query, mode: 'insensitive' as const } } },
          ],
        }
      : null;

    const rows = await this.prisma.conversation.findMany({
      where: {
        AND: [this.accessibleMembershipWhere(myId), ...(queryFilter ? [queryFilter] : [])],
        states: { none: { userId: myId, hidden: true } },
      },
      include: this.includeConversationForUser(myId),
    });

    const items = await Promise.all(rows.map((conv) => this.mapConversationListItem(myId, conv)));

    items.sort((a, b) => {
      const pinDiff = Number(!!b.pinned) - Number(!!a.pinned);
      if (pinDiff !== 0) return pinDiff;
      return this.rankTimestamp(b) - this.rankTimestamp(a);
    });

    return { ok: true, items };
  }

  async markAsRead(myId: string, conversationId: string) {
    await this.assertMember(myId, conversationId);

    await this.prisma.conversationUserState.upsert({
      where: { conversationId_userId: { conversationId, userId: myId } },
      update: { lastReadAt: new Date(), hidden: false },
      create: { conversationId, userId: myId, lastReadAt: new Date(), hidden: false },
    });

    return { ok: true };
  }

  async hideConversation(myId: string, conversationId: string) {
    const conv = await this.assertMember(myId, conversationId);
    if (conv.kind === 'GROUP' && this.isCurrentParticipant(myId, conv)) {
      throw new BadRequestException('Saia do grupo antes de remover ele dos seus chats');
    }
    if (conv.kind === 'BROADCAST' && this.isCurrentParticipant(myId, conv)) {
      throw new BadRequestException('Exclua a lista antes de remover ela dos seus chats');
    }

    await this.markAsRead(myId, conversationId);

    await this.prisma.conversationUserState.update({
      where: { conversationId_userId: { conversationId, userId: myId } },
      data: { hidden: true },
    });

    return { ok: true };
  }

  async setPinned(myId: string, conversationId: string, value: boolean) {
    await this.assertMember(myId, conversationId);

    await this.prisma.conversationUserState.upsert({
      where: { conversationId_userId: { conversationId, userId: myId } },
      update: { pinned: !!value, hidden: false } as any,
      create: {
        conversationId,
        userId: myId,
        pinned: !!value,
        hidden: false,
      } as any,
    });

    return { ok: true, pinned: !!value };
  }

  async setConversationAvatar(myId: string, conversationId: string, avatarUrl: string | null) {
    const conv = await this.assertCurrentParticipant(myId, conversationId);
    if (conv.kind === 'DIRECT') {
      throw new BadRequestException('Conversas diretas não possuem foto própria');
    }
    if (conv.kind === 'GROUP') {
      this.requireGroupAdminPermission(myId, conv, 'alterar a foto do grupo');
    }
    if (conv.kind === 'BROADCAST' && conv.createdById !== myId) {
      throw new ForbiddenException('Somente quem criou a lista pode trocar a foto');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        avatarUrl: avatarUrl?.trim() ? avatarUrl.trim() : null,
      },
    });

    return {
      ok: true,
      conversation: await this.serializeConversationForUser(myId, conversationId, {
        includeBroadcastAudienceDetails: conv.kind === 'BROADCAST',
        includeAvailableBroadcastUsers: conv.kind === 'BROADCAST',
      }),
    };
  }
}

