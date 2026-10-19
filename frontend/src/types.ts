// Типы контента — зеркало backend/app/schema.py

export interface Option {
  text: string;
  correct: boolean;
  why: string;
}

export type QuestionType = "single" | "multiple" | "output" | "find_bug";

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  code: string;
  options: Option[];
  answer: string;
  explanation: string;
}

export interface TestCase {
  name: string;
  stdin?: string | null;
  setup?: string | null;
  call?: string | null;
  expected?: string | null;
  stdout?: string | null;
  stdout_contains?: string[] | null;
  code?: string | null;
}

export interface Example {
  input: string;
  output: string;
  explanation: string;
}

export interface Constraints {
  require: string[];
  forbid: string[];
  message: string;
}

export interface Task {
  id: string;
  title: string;
  mode: "browser" | "local";
  difficulty: number;
  statement: string;
  examples: Example[];
  starter: string;
  hints: string[];
  solution: string;
  solution_explanation: string;
  tests: TestCase[];
  setup: string;
  files: Record<string, string>;
  assets: string[];
  constraints: Constraints | null;
  timeout: number;
  mini_project: boolean;
  run: string;
  solution_files: Record<string, string>;
}

export interface Lesson {
  id: string;
  title: string;
  theory: string;
  questions: Question[];
  tasks: Task[];
}

export interface Practicum {
  title: string;
  description: string;
  pass_threshold: number;
  questions: Question[];
  tasks: Task[];
}

export interface Stage {
  id: string;
  title: string;
  description: string;
  hints: string[];
  tasks: Task[];
  criteria: string[];
}

export interface Project {
  title: string;
  description: string;
  mode: "browser" | "local";
  requirements: string[];
  stages: Stage[];
  solution: string;
}

// ---- дерево курса (/api/course) ----

export interface LessonNode {
  id: string;
  title: string;
  items: string[];
  available: boolean;
}

export interface BlockNode {
  id: string;
  title: string;
  description: string;
  mini_project: string;
  lessons: LessonNode[];
  practicum: { title: string; items: string[]; pass_threshold: number } | null;
  has_cheatsheet: boolean;
}

export interface ProjectNode {
  id: "project";
  title: string;
  mode: "browser" | "local";
  stages: { id: string; title: string; items: string[] }[];
}

export interface PartNode {
  id: string;
  title: string;
  description: string;
  runtime: "browser" | "local" | "mixed";
  optional: boolean;
  blocks: BlockNode[];
  project: ProjectNode | null;
}

export interface Course {
  parts: PartNode[];
  errors: string[];
}

// ---- результаты выполнения кода ----

export interface RunResult {
  stdout: string;
  error: string | null;
  images: string[];
}

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  stdout?: string;
}

export interface CheckResult {
  passed: boolean;
  results: TestResult[];
  error: string | null;
}
