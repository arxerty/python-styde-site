import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { CheatsheetPage } from "./pages/CheatsheetPage";
import { HomePage } from "./pages/HomePage";
import { LessonPage } from "./pages/LessonPage";
import { MistakesPage } from "./pages/MistakesPage";
import { PracticumPage } from "./pages/PracticumPage";
import { ProjectPage } from "./pages/ProjectPage";
import { useAuth } from "./store/auth";
import { useCourse } from "./store/course";
import "./styles.css";

function App() {
  useEffect(() => {
    useCourse.getState().load();
    useAuth.getState().init();
    // Подтягиваем свежий контент, когда вкладка снова в фокусе (новые блоки появляются без перезагрузки)
    const onFocus = () => useCourse.getState().load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="learn/:part/project" element={<ProjectPage />} />
        <Route path="learn/:part/:block/practicum" element={<PracticumPage />} />
        <Route path="learn/:part/:block/cheatsheet" element={<CheatsheetPage />} />
        <Route path="learn/:part/:block/:lesson" element={<LessonPage />} />
        <Route path="mistakes" element={<MistakesPage />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
