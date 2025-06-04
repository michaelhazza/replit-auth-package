import { pgTable, text, serial, integer, boolean, jsonb, timestamp, decimal, numeric, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Define user roles enum
export const UserRole = {
  USER: 'user',
  COACH: 'coach',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

// Users table schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").notNull().default(UserRole.USER),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  activationToken: text("activation_token"),
  credits: integer("credits").default(0).notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  // Enhanced session management
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  accountLockedUntil: timestamp("account_locked_until"),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorBackupCodes: text("two_factor_backup_codes").array(),
  // User preferences
  preferences: jsonb("preferences").default({}).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires"),
  pendingEmail: text("pending_email"),
  emailTokenExpires: timestamp("email_token_expires"),
  deactivatedAt: timestamp("deactivated_at"),
});

export const whitelistedEmails = pgTable("whitelisted_emails", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  invitedBy: integer("invited_by").references(() => users.id),
  invitationSent: boolean("invitation_sent").default(false).notNull(),
  invitationToken: text("invitation_token"),
  tokenExpires: timestamp("token_expires"),
  assignedRole: text("assigned_role").default(UserRole.USER).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Express session store table (required by connect-pg-simple)
export const expressSession = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Relation will be defined after sessions table is created

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  firstName: true,
  lastName: true,
  role: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;



// Create a Zod schema for validating user roles
export const userRoleSchema = z.enum([
  UserRole.USER, 
  UserRole.COACH, 
  UserRole.ADMIN, 
  UserRole.SUPER_ADMIN
]);

export const insertWhitelistedEmailSchema = createInsertSchema(whitelistedEmails).pick({
  email: true,
  invitedBy: true,
  assignedRole: true,
});

export type InsertWhitelistedEmail = z.infer<typeof insertWhitelistedEmailSchema>;
export type WhitelistedEmail = typeof whitelistedEmails.$inferSelect;

// Financial Blueprint Steps - Enhanced for dynamic management
export const steps = pgTable("steps", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  gptPrompt: text("gpt_prompt").notNull().default(''),
  gptInstructionsLink: text("gpt_instructions_link").notNull().default(''),
  additionalContextLink: text("additional_context_link").default(''),
  isGptStep: boolean("is_gpt_step").notNull().default(true),
  inputFields: jsonb("input_fields").notNull().default([]), // Array of InputField objects
  inputVariables: jsonb("input_variables").notNull().default([]),
  conversationStarters: jsonb("conversation_starters").notNull().default([]),
  outputVariable: text("output_variable").notNull(),
  order: integer("order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
  lastModifiedBy: integer("last_modified_by").references(() => users.id),
});

export const insertStepSchema = createInsertSchema(steps);
export type InsertStep = z.infer<typeof insertStepSchema>;
export type Step = typeof steps.$inferSelect;

// User Sessions for tracking progress
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  currentStepId: integer("current_step_id").notNull(),
  completed: boolean("completed").default(false).notNull(),
  maxRevealedStep: integer("max_revealed_step").default(1).notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  messages: many(messages),
  stepInputs: many(stepInputs),
  stepOutputs: many(stepOutputs),
  blueprint: one(blueprints, {
    fields: [sessions.sessionId],
    references: [blueprints.sessionId],
  }),
}));

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Conversations within each step
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  stepId: integer("step_id").notNull().references(() => steps.id),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.sessionId],
  }),
  step: one(steps, {
    fields: [messages.stepId],
    references: [steps.id],
  }),
}));

// We'll use the messageSchema defined further down in this file

// For database inserts
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Output of each step
export const stepOutputs = pgTable("step_outputs", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  stepId: integer("step_id").notNull().references(() => steps.id),
  output: text("output").notNull(),
  variableName: text("variable_name").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export const stepOutputsRelations = relations(stepOutputs, ({ one }) => ({
  user: one(users, {
    fields: [stepOutputs.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [stepOutputs.sessionId],
    references: [sessions.sessionId],
  }),
  step: one(steps, {
    fields: [stepOutputs.stepId],
    references: [steps.id],
  }),
}));

export const insertStepOutputSchema = createInsertSchema(stepOutputs).omit({ id: true });
export type InsertStepOutput = z.infer<typeof insertStepOutputSchema>;
export type StepOutput = typeof stepOutputs.$inferSelect;

// Step additional inputs (for non-GPT steps)
export const stepInputs = pgTable("step_inputs", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  stepId: integer("step_id").notNull().references(() => steps.id),
  fieldName: text("field_name").notNull(),
  fieldValue: text("field_value").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const stepInputsRelations = relations(stepInputs, ({ one }) => ({
  user: one(users, {
    fields: [stepInputs.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [stepInputs.sessionId],
    references: [sessions.sessionId],
  }),
  step: one(steps, {
    fields: [stepInputs.stepId],
    references: [steps.id],
  }),
}));

export const insertStepInputSchema = createInsertSchema(stepInputs).omit({ id: true });
export type InsertStepInput = z.infer<typeof insertStepInputSchema>;
export type StepInput = typeof stepInputs.$inferSelect;

// Final Financial Blueprint
export const blueprints = pgTable("blueprints", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  blueprint: jsonb("blueprint").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export const blueprintsRelations = relations(blueprints, ({ one }) => ({
  user: one(users, {
    fields: [blueprints.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [blueprints.sessionId],
    references: [sessions.sessionId],
  }),
}));

export const insertBlueprintSchema = createInsertSchema(blueprints).omit({ id: true });
export type InsertBlueprint = z.infer<typeof insertBlueprintSchema>;
export type Blueprint = typeof blueprints.$inferSelect;

// Credit system tables
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const creditPackages = pgTable("credit_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  credits: integer("credits").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  stripePriceId: text("stripe_price_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  type: text("type").notNull(), // purchase, usage, admin_credit, etc.
  description: text("description"),
  stripePaymentId: text("stripe_payment_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  packageId: integer("package_id").references(() => creditPackages.id),
  addedBy: integer("added_by").references(() => users.id),
});

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [systemSettings.updatedBy],
    references: [users.id],
  }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, {
    fields: [creditTransactions.userId],
    references: [users.id],
  }),
  package: one(creditPackages, {
    fields: [creditTransactions.packageId],
    references: [creditPackages.id],
  }),
  addedByUser: one(users, {
    fields: [creditTransactions.addedBy],
    references: [users.id],
  }),
}));

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({ id: true });
export type InsertSystemSetting = z.infer<typeof insertSystemSettingsSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

export const insertCreditPackageSchema = createInsertSchema(creditPackages).omit({ id: true });
export type InsertCreditPackage = z.infer<typeof insertCreditPackageSchema>;
export type CreditPackage = typeof creditPackages.$inferSelect;

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({ id: true });
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;



// Message type for frontend state and validation
export const messageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.union([z.date(), z.string()]).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ).optional().default(() => new Date()),
});

export type MessageType = z.infer<typeof messageSchema>;

// Input field type for step configuration with enhanced options
export const inputFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  type: z.enum(["text", "textarea", "number", "select", "radio", "checkbox", "date", "email", "tel", "url"]),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  defaultValue: z.string().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.string()
  })).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    patternMessage: z.string().optional(),
  }).optional(),
  required: z.boolean().default(false),
  width: z.enum(["full", "half", "third", "quarter"]).default("full"),
  hidden: z.boolean().default(false),
  conditionalDisplay: z.object({
    field: z.string().optional(),
    operator: z.enum(["equals", "not_equals", "contains", "not_contains", "greater_than", "less_than"]).optional(),
    value: z.string().optional(),
  }).optional(),
});

export type InputField = z.infer<typeof inputFieldSchema>;

// Step data type for frontend state - enhanced for dynamic step management
export const stepDataSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  gptInstructionsLink: z.string().optional(),
  additionalContextLink: z.string().optional(),
  isGptStep: z.boolean().default(true),
  outputVariable: z.string(),
  inputFields: z.array(inputFieldSchema).default([]),
  inputVariables: z.array(z.string()).default([]),
  conversationStarters: z.array(z.string()).default([]),
  order: z.number(),
  completed: z.boolean().default(false),
  active: z.boolean().default(false),
  isActive: z.boolean().default(true),
  messages: z.array(messageSchema).default([]),
  output: z.any().nullable().default(null),
  finalOutput: z.string().nullable().default(null),
  inputs: z.record(z.string(), z.string()).default({}),
  sessionId: z.string().optional(),
  lastModified: z.date().optional(),
  lastModifiedBy: z.number().optional(),
});

export type StepData = z.infer<typeof stepDataSchema>;

// Test Results Schema
export const testRuns = pgTable("test_runs", {
  id: serial("id").primaryKey(),
  commitHash: text("commit_hash"),
  branch: text("branch").default("main"),
  status: text("status").notNull(), // 'running', 'passed', 'failed'
  totalTests: integer("total_tests").notNull().default(0),
  passedTests: integer("passed_tests").notNull().default(0),
  failedTests: integer("failed_tests").notNull().default(0),
  duration: integer("duration"), // milliseconds
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorSummary: text("error_summary"),
  totalFiles: integer("total_files").notNull().default(0),
  completedFiles: integer("completed_files").notNull().default(0),
  currentFile: text("current_file"),
  currentPhase: text("current_phase"), // 'backend', 'frontend', 'completed'
});

export const testCases = pgTable("test_cases", {
  id: serial("id").primaryKey(),
  testRunId: integer("test_run_id").notNull().references(() => testRuns.id),
  testSuite: text("test_suite").notNull(), // 'unit', 'integration', 'api'
  testName: text("test_name").notNull(),
  status: text("status").notNull(), // 'passed', 'failed', 'skipped'
  duration: integer("duration"), // milliseconds
  errorMessage: text("error_message"),
  stackTrace: text("stack_trace"),
});

export const testRunsRelations = relations(testRuns, ({ many }) => ({
  testCases: many(testCases),
}));

export const testCasesRelations = relations(testCases, ({ one }) => ({
  testRun: one(testRuns, {
    fields: [testCases.testRunId],
    references: [testRuns.id],
  }),
}));

export const insertTestRunSchema = createInsertSchema(testRuns).omit({ id: true });
export type InsertTestRun = z.infer<typeof insertTestRunSchema>;
export type TestRun = typeof testRuns.$inferSelect;

export const insertTestCaseSchema = createInsertSchema(testCases).omit({ id: true });
export type InsertTestCase = z.infer<typeof insertTestCaseSchema>;
export type TestCase = typeof testCases.$inferSelect;

// Enhanced Authentication Tables
// User Sessions table for enhanced session tracking
export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionId: text("session_id").notNull().unique(),
  deviceInfo: text("device_info"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isActive: boolean("is_active").default(true).notNull(),
  rememberMe: boolean("remember_me").default(false).notNull(),
  lastActivity: timestamp("last_activity").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Audit Log table for security tracking
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Permissions table for granular access control
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Role Permissions junction table
export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  permissionId: integer("permission_id").references(() => permissions.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User specific permissions (overrides role permissions)
export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  permissionId: integer("permission_id").references(() => permissions.id).notNull(),
  granted: boolean("granted").notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Password History for preventing reuse
export const passwordHistory = pgTable("password_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Enhanced auth schemas
export const insertUserSessionSchema = createInsertSchema(userSessions).pick({
  userId: true,
  sessionId: true,
  deviceInfo: true,
  ipAddress: true,
  userAgent: true,
  rememberMe: true,
  expiresAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).pick({
  userId: true,
  action: true,
  entityType: true,
  entityId: true,
  oldValues: true,
  newValues: true,
  ipAddress: true,
  userAgent: true,
});

export const insertPermissionSchema = createInsertSchema(permissions).pick({
  name: true,
  description: true,
  resource: true,
  action: true,
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).pick({
  role: true,
  permissionId: true,
});

export const insertUserPermissionSchema = createInsertSchema(userPermissions).pick({
  userId: true,
  permissionId: true,
  granted: true,
  expiresAt: true,
});

export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessions.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;
export type PasswordHistory = typeof passwordHistory.$inferSelect;
