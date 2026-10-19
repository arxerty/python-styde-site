# Python → AI Engineer

Веб-платформа курса «от нуля до Junior AI Engineer»: теория с запускаемыми примерами, вопросы с разбором,
задачи с автоматической проверкой кода прямо в браузере (Pyodide) и локальные задания с pytest.

## Архитектура

```
frontend/  React + Vite + TypeScript
  src/pages/        Главная, Урок, Практикум, Шпаргалка, Проект, Мои ошибки, Вход
  src/components/   Дерево курса, карточки вопросов и задач, Monaco-редактор, Markdown
  src/python/       Очередь заданий к Pyodide (таймаут, перезапуск при бесконечном цикле)
  src/store/        Прогресс (localStorage + синхронизация с сервером), авторизация, курс
  public/pyodide-worker.js   Web Worker с Python 3.12 (Pyodide 0.26)
  public/py/runner.py        Движок: запуск кода, скрытые тесты, ошибки на русском
backend/   FastAPI + SQLAlchemy (PostgreSQL; без настройки — SQLite)
  app/schema.py     Pydantic-схема файлов контента (источник правды)
  app/content.py    Загрузка content/, автоподхват новых папок
  app/auth.py       Регистрация/вход, JWT
  app/main.py       API: курс, уроки, файлы, ZIP local-заданий, прогресс
content/   Контент курса: part-XX/block-YY/...
tools/verify_content.py   Проверка контента: схема + прогон эталонных решений через тесты
docs/      Схема контента и шаблон промта
```

**Как проверяется код.** Части 1–5: код ученика и скрытые тесты выполняются в браузере в Web Worker
(Pyodide, numpy/pandas/scikit-learn/matplotlib подгружаются автоматически). Каждый тест — отдельный запуск
с таймаутом; при зависании воркер перезапускается. Части 6–8: задания `local` — ZIP с заготовкой и pytest-тестами,
ученик вставляет вывод тестов.

**Прогресс.** Хранится по элементам (`part/block/lesson/q|t/id`). Без входа — в localStorage, после входа
синхронизируется с сервером (побеждает более свежая запись). Уроки открываются последовательно;
переключатель «Всё открыто» снимает блокировку.

## Запуск

Нужны Python 3.12+ и Node.js 20+.

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Откройте http://localhost:5173. Фронтенд проксирует `/api` на бэкенд.

### PostgreSQL

По умолчанию используется `backend/dev.db` (SQLite). Для PostgreSQL:

```bash
docker compose up -d db
```

и в `backend/.env` (см. `backend/.env.example`):

```
DATABASE_URL=postgresql+psycopg://course:course@localhost:5432/course
SECRET_KEY=длинная-случайная-строка
```

Таблицы создаются при старте автоматически.

### Продакшн-сборка одним процессом

```bash
cd frontend
npm run build
```

После сборки бэкенд сам раздаёт `frontend/dist`: достаточно запустить uvicorn и открыть http://localhost:8000.

## Добавление блока

1. Создайте папку `content/part-XX/block-YY/` (и `part.yaml`, если часть новая).
2. Положите `block.yaml`, `lesson-NN.md`, `lesson-NN.yaml`, `practicum.yaml`, `cheatsheet.md` — формат в [docs/CONTENT_SCHEMA.md](docs/CONTENT_SCHEMA.md).
3. Проверьте:

   ```bash
   backend\.venv\Scripts\python tools\verify_content.py part-XX/block-YY
   ```

   Скрипт сверяет файлы со схемой, прогоняет эталонные решения через скрытые тесты, убеждается, что заготовка
   тесты не проходит, и что в вопросах «что выведет код?» правильный ответ совпадает с реальным выводом.
   Флаг `--local` дополнительно запускает pytest для local-заданий.
4. Обновите страницу — блок появится в дереве курса. Ошибки в файлах видны на главной.

Генерация контента с ИИ: [docs/PROMPT_TEMPLATE.md](docs/PROMPT_TEMPLATE.md) — общий шаблон со вставленной схемой.
