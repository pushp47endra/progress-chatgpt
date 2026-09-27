import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const priorityEnum = z.enum(["low", "medium", "high"]);
export const difficultyEnum = z.enum(["easy", "medium", "hard"]);
export const questionStatusEnum = z.enum([
  "not_attempted",
  "attempted",
  "correct",
  "incorrect",
  "skipped",
]);
export const revisionStatusEnum = z.enum(["not_revised", "revised", "mastered"]);

export const chatMessageSchema = z
  .object({
    conversationId: z.string().nullable().optional(),
    message: z.string().min(1).max(8000).optional(),
    debugMode: z.boolean().optional(),
    skipOptimizer: z.boolean().optional(),
    // If set, retry an existing user message (after optimizer/Luna failure)
    // instead of creating a new one - prevents duplicate messages on retry.
    retryMessageId: z.string().optional(),
  })
  .refine((d) => Boolean(d.message) || Boolean(d.retryMessageId), {
    message: "message or retryMessageId is required",
  });

export const createTaskSchema = z.object({
  date: z.string(), // ISO date (yyyy-MM-dd)
  subjectId: z.string().optional().nullable(),
  topicId: z.string().optional().nullable(),
  subtopic: z.string().max(300).optional().nullable(),
  estimatedTime: z.number().int().min(0).max(1440).optional().nullable(),
  priority: priorityEnum.optional(),
  difficulty: difficultyEnum.optional(),
  questionTarget: z.number().int().min(0).max(1000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  completed: z.boolean().optional(),
});

export const createSubjectSchema = z.object({
  name: z.string().min(1).max(150),
});

export const createTopicSchema = z.object({
  subjectId: z.string().min(1),
  name: z.string().min(1).max(200),
  priority: priorityEnum.optional(),
  estimatedTime: z.number().int().min(0).max(10000).optional().nullable(),
  questionTarget: z.number().int().min(0).max(1000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateTopicSchema = createTopicSchema.partial().extend({
  completed: z.boolean().optional(),
});

export const createQuestionSchema = z.object({
  subjectId: z.string().optional().nullable(),
  topicId: z.string().optional().nullable(),
  questionText: z.string().min(1).max(10000),
  difficulty: difficultyEnum.optional(),
  source: z.string().max(200).optional().nullable(),
  userAnswer: z.string().max(5000).optional().nullable(),
  correctAnswer: z.string().max(5000).optional().nullable(),
  explanation: z.string().max(8000).optional().nullable(),
  status: questionStatusEnum.optional(),
});

export const updateQuestionSchema = createQuestionSchema.partial();

export const createMistakeSchema = z.object({
  subjectId: z.string().optional().nullable(),
  topicId: z.string().optional().nullable(),
  question: z.string().min(1).max(10000),
  myAnswer: z.string().max(5000).optional().nullable(),
  correctAnswer: z.string().max(5000).optional().nullable(),
  whyWrong: z.string().max(5000).optional().nullable(),
  correctConcept: z.string().max(5000).optional().nullable(),
  revisionStatus: revisionStatusEnum.optional(),
});

export const updateMistakeSchema = createMistakeSchema.partial();

export const createNoteSchema = z.object({
  subjectId: z.string().optional().nullable(),
  topicId: z.string().optional().nullable(),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(50000),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const updateNoteSchema = createNoteSchema.partial();

export const updateSettingsSchema = z.object({
  dailyTargetMinutes: z.number().int().min(0).max(1440).optional(),
  preferredLanguage: z.string().max(50).optional(),
  preferredDifficulty: difficultyEnum.optional(),
  theme: z.enum(["dark", "light"]).optional(),
  debugMode: z.boolean().optional(),
});

export const studySessionStartSchema = z.object({
  subjectId: z.string().optional().nullable(),
  topicName: z.string().max(200).optional().nullable(),
});

export const studySessionStopSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().optional().nullable(),
  topicName: z.string().max(200).optional().nullable(),
});