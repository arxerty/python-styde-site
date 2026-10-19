import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { aggregate } from "../lib/progress";
import { useCourseState } from "../lib/hooks";
import { useAuth } from "../store/auth";
import { useProgress } from "../store/progress";
import { Sidebar } from "./Sidebar";

function ThemeToggle() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "light");
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }
  return (
    <button className="icon-btn" onClick={toggle} title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { units, items } = useCourseState();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const freeMode = useProgress((s) => s.freeMode);
  const setFreeMode = useProgress((s) => s.setFreeMode);
  const syncError = useProgress((s) => s.syncError);
  const location = useLocation();
  const total = aggregate(units.filter((u) => !u.optional), items);
  const mistakes = Object.values(items).filter((item) => item.mistake).length;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className={`app ${menuOpen ? "menu-open" : ""}`}>
      <header className="topbar">
        <button className="icon-btn burger" onClick={() => setMenuOpen((v) => !v)} aria-label="Меню">
          ☰
        </button>
        <Link to="/" className="logo">
          <span className="logo-mark">🐍</span>
          <span className="logo-text">Python → AI Engineer</span>
        </Link>
        <div className="topbar-progress" title="Прогресс по курсу">
          <div className="progress progress-thin">
            <div className="progress-fill" style={{ width: `${total.percent}%` }} />
          </div>
          <span>{total.percent}%</span>
        </div>
        <div className="topbar-actions">
          <Link to="/mistakes" className="btn btn-ghost btn-small">
            Мои ошибки{mistakes > 0 && <span className="badge">{mistakes}</span>}
          </Link>
          <label className="free-mode" title="Открыть все уроки без последовательного прохождения">
            <input type="checkbox" checked={freeMode} onChange={(e) => setFreeMode(e.target.checked)} />
            <span>Всё открыто</span>
          </label>
          <ThemeToggle />
          {user ? (
            <div className="user-menu">
              <span className="user-name" title={user.email}>
                {user.name}
              </span>
              <button className="btn btn-ghost btn-small" onClick={logout}>
                Выйти
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-primary btn-small">
              Войти
            </Link>
          )}
        </div>
      </header>
      {syncError && <div className="sync-error">Прогресс не сохранён на сервере: {syncError}. Повторим автоматически.</div>}
      <aside className="sidebar-wrap">
        <Sidebar onNavigate={() => setMenuOpen(false)} />
      </aside>
      <div className="backdrop" onClick={() => setMenuOpen(false)} />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
