import { useEffect, useState } from "react";
import { useAdminAuth } from "./adminAuth";
import { useTheme } from "./theme";
import { TopNav } from "./components/TopNav";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminAppConfigPage } from "./pages/AdminAppConfigPage";
import { AdminFirstLoginPage } from "./pages/AdminFirstLoginPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AdminOrgPage } from "./pages/AdminOrgPage";
import { AdminHistoryPage } from "./pages/AdminHistoryPage";

type PageKey = "dashboard" | "appConfig" | "users" | "org" | "history" | "audit";

type Me = {
  id: string;
  username: string;
  name: string;
  isSuperAdmin: boolean;
  mustChangeCredentials: boolean;
};

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const { isAuthenticated, logout, logoff, api } = useAdminAuth();
  const { theme, toggle, logoUrl } = useTheme();
  const [page, setPage] = useState<PageKey>("dashboard");
  const [isMobileNav, setIsMobileNav] = useState(() => window.innerWidth <= 900);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAppConfigPage = page === "appConfig";

  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);

  async function loadMe() {
    setLoadingMe(true);
    try {
      const res = await api.get<Me>("/admin/auth/me");
      setMe(res.data);
    } catch {
      logout();
    } finally {
      setLoadingMe(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setMe(null);
      return;
    }
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    const onResize = () => setIsMobileNav(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [page, isMobileNav]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const close = () => setMobileNavOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [mobileNavOpen]);

  if (!isAuthenticated) return <AdminLoginPage />;

  if (loadingMe || !me) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)" }}>
        Carregando...
      </div>
    );
  }

  if (me.mustChangeCredentials) {
    if (!me.isSuperAdmin) {
      logout();
      return null;
    }

    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <TopNav
          title="BHASH • Admin"
          subtitle="Painel administrativo"
          theme={theme}
        onToggleTheme={toggle}
        logoSrc={logoUrl}
        rightSlot={
          <button onClick={logoff} className="admin-logoutBtn">
            Sair
          </button>
        }
      />
        <AdminFirstLoginPage />
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <TopNav
        title="BHASH • Admin"
        subtitle="Painel administrativo"
        theme={theme}
        onToggleTheme={toggle}
        logoSrc={logoUrl}
        rightSlot={
          isMobileNav ? (
            <div className="admin-mobileNavWrap" onClick={(e) => e.stopPropagation()}>
              <button
                className={`admin-hamburgerBtn ${mobileNavOpen ? "is-open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileNavOpen((v) => !v);
                }}
                title="Abrir menu"
              >
                <MenuIcon />
              </button>

              {mobileNavOpen ? (
                <div className="admin-mobileNavMenu" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setPage("dashboard")}
                    className={`admin-mobileNavItem ${page === "dashboard" ? "is-active" : ""}`}
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => setPage("appConfig")}
                    className={`admin-mobileNavItem ${page === "appConfig" ? "is-active" : ""}`}
                  >
                    Config App
                  </button>
                  <button
                    onClick={() => setPage("users")}
                    className={`admin-mobileNavItem ${page === "users" ? "is-active" : ""}`}
                  >
                    Usuários
                  </button>
                  <button
                    onClick={() => setPage("org")}
                    className={`admin-mobileNavItem ${page === "org" ? "is-active" : ""}`}
                  >
                    Empresas/Setores
                  </button>
                  <button
                    onClick={() => setPage("history")}
                    className={`admin-mobileNavItem ${page === "history" ? "is-active" : ""}`}
                  >
                    Históricos
                  </button>
                  <button onClick={logoff} className="admin-mobileNavItem admin-mobileNavItem--danger">
                    Sair
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="admin-navActions">
              <button
                onClick={() => setPage("dashboard")}
                className={`admin-navBtn ${page === "dashboard" ? "is-active" : ""}`}
                aria-current={page === "dashboard" ? "page" : undefined}
              >
                Dashboard
              </button>
              <button
                onClick={() => setPage("appConfig")}
                className={`admin-navBtn ${page === "appConfig" ? "is-active" : ""}`}
                aria-current={page === "appConfig" ? "page" : undefined}
              >
                Config App
              </button>
              <button
                onClick={() => setPage("users")}
                className={`admin-navBtn ${page === "users" ? "is-active" : ""}`}
                aria-current={page === "users" ? "page" : undefined}
              >
                Usuários
              </button>

              <button
                onClick={() => setPage("org")}
                className={`admin-navBtn ${page === "org" ? "is-active" : ""}`}
                aria-current={page === "org" ? "page" : undefined}
              >
                Empresas/Setores
              </button>

              <button
                onClick={() => setPage("history")}
                className={`admin-navBtn ${page === "history" ? "is-active" : ""}`}
                aria-current={page === "history" ? "page" : undefined}
              >
                Históricos
              </button>

              <button onClick={logoff} className="admin-logoutBtn">
                Sair
              </button>
            </div>
          )
        }
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: isAppConfigPage && !isMobileNav ? "hidden" : "auto",
          display: isAppConfigPage && !isMobileNav ? "flex" : "block",
        }}
      >
        {page === "dashboard" ? (
          <AdminDashboard />
        ) : page === "appConfig" ? (
          <AdminAppConfigPage />
        ) : page === "users" ? (
          <AdminUsersPage />
        ) : page === "org" ? (
          <AdminOrgPage />
        ) : page === "history" ? (
          <AdminHistoryPage />
        ) : null}
      </div>
    </div>
  );
}

