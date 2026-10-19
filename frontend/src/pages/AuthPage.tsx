import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, name, password);
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>{mode === "login" ? "Вход" : "Регистрация"}</h1>
        <p className="muted small">
          Прогресс сохраняется в аккаунте и доступен с любого устройства. Без входа он хранится только в этом браузере.
        </p>
        {mode === "register" && (
          <label>
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {error && <div className="bad">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>
        <div className="small">
          {mode === "login" ? (
            <>
              Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
            </>
          ) : (
            <>
              Уже есть аккаунт? <Link to="/login">Войти</Link>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
