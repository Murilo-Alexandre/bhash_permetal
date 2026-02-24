import { useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "../adminAuth";
import { useTheme } from "../theme";
import { API_BASE } from "../api";

type AppConfig = { primaryColor: string; logoUrl?: string | null };

const DEFAULT_PRIMARY = "#001F3F";

export function AdminAppConfigPage() {
  const { api } = useAdminAuth();
  const { reloadAppConfig } = useTheme();

  const [cfg, setCfg] = useState<AppConfig | null>(null);

  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [saving, setSaving] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const logoPreview = useMemo(() => {
    if (!cfg?.logoUrl) return "/logo_bhash.png";
    return withApiBase(cfg.logoUrl);
  }, [cfg?.logoUrl]);

  useEffect(() => {
    (async () => {
      const res = await api.get<AppConfig>("/app-config");
      setCfg(res.data);
      setPrimaryColor(res.data.primaryColor ?? DEFAULT_PRIMARY);
    })().catch(() => setMsg("Falha ao carregar /app-config"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshCfgFromApi() {
    const res = await api.get<AppConfig>("/app-config");
    setCfg(res.data);
    setPrimaryColor(res.data.primaryColor ?? DEFAULT_PRIMARY);
  }

  async function saveColor() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await api.put<AppConfig>("/admin/app-config", { primaryColor });
      setCfg(res.data as any);
      setMsg("✅ Cor atualizada");
      await reloadAppConfig();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? "Falha ao salvar cor");
    } finally {
      setSaving(false);
    }
  }

  async function resetColorDefault() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await api.put<AppConfig>("/admin/app-config", { primaryColor: DEFAULT_PRIMARY });
      setCfg(res.data as any);
      setPrimaryColor(DEFAULT_PRIMARY);
      setMsg("✅ Cor voltou pro padrão");
      await reloadAppConfig();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? "Falha ao resetar cor");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await api.post("/admin/app-config/logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const newCfg: AppConfig = res.data?.config ?? { primaryColor, logoUrl: res.data?.logoUrl };
      setCfg(newCfg);
      setMsg("✅ Logo enviada");

      await reloadAppConfig();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function resetLogoDefault() {
    setUploading(true);
    setMsg(null);
    try {
      await api.put<AppConfig>("/admin/app-config", { logoUrl: null });
      await refreshCfgFromApi();
      setMsg("✅ Logo voltou pro padrão");
      await reloadAppConfig();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? "Falha ao resetar logo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ width: "min(1100px, 100%)", margin: "0 auto", padding: "18px 16px 56px" }}>
      <h1 style={{ margin: 0, marginBottom: 12 }}>Config do App</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
        <Card title="Logo" colSpan={6}>
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                height: 140,
                borderRadius: 18,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.02)",
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
              }}
            >
              <img
                src={logoPreview}
                alt="logo"
                style={{ maxHeight: 92, maxWidth: "85%", objectFit: "contain" }}
                onError={(e) => (((e.currentTarget as HTMLImageElement).style.display = "none"))}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={resetLogoDefault}
                disabled={uploading}
                style={{
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  cursor: uploading ? "not-allowed" : "pointer",
                  fontWeight: 800,
                  background: "transparent",
                  color: "var(--fg)",
                  opacity: uploading ? 0.85 : 1,
                }}
              >
                Logo default
              </button>
            </div>

            <label style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Enviar PNG/JPG/WEBP (até 2MB)</div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                }}
              />
            </label>

            <div style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all" }}>
              logoUrl atual: {cfg?.logoUrl ?? "(vazio)"}
            </div>
          </div>
        </Card>

        <Card title="Cor primária" colSpan={6}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                style={{ width: 52, height: 40, border: "none", background: "transparent" }}
              />

              <input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder={DEFAULT_PRIMARY}
                style={{
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--input-border)",
                  background: "var(--input-bg)",
                  color: "var(--input-fg)",
                  outline: "none",
                  width: 180,
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={saveColor}
                disabled={saving}
                style={{
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 800,
                  background: "var(--btn-bg)",
                  color: "var(--btn-fg)",
                  opacity: saving ? 0.85 : 1,
                  width: 180,
                }}
              >
                {saving ? "Salvando..." : "Salvar cor"}
              </button>

              <button
                onClick={resetColorDefault}
                disabled={saving}
                style={{
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 800,
                  background: "transparent",
                  color: "var(--fg)",
                  opacity: saving ? 0.85 : 1,
                }}
              >
                Cor primária default
              </button>
            </div>
          </div>
        </Card>

        {msg ? (
          <Card title="Status" colSpan={12}>
            <div style={{ color: "var(--muted)" }}>{msg}</div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Card({ title, colSpan, children }: { title: string; colSpan: number; children: any }) {
  return (
    <div
      style={{
        gridColumn: `span ${colSpan}`,
        padding: 16,
        borderRadius: 18,
        border: "1px solid var(--border)",
        background: "var(--card-bg)",
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function withApiBase(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url}`;
}
