import { 
  users, type User, type InsertUser,
  whitelistedEmails, type WhitelistedEmail, type InsertWhitelistedEmail,
  steps, type Step, type InsertStep,
  sessions, type Session, type InsertSession, 
  messages, type Message, type InsertMessage,
  stepOutputs, type StepOutput, type InsertStepOutput,
  stepInputs, type StepInput, type InsertStepInput,
  blueprints, type Blueprint, type InsertBlueprint,
  systemSettings, type SystemSetting, type InsertSystemSetting,
  userSessions, type UserSession, type InsertUserSession,
  auditLogs, type AuditLog, type InsertAuditLog,
  permissions, type Permission, type InsertPermission,
  rolePermissions, type RolePermission, type InsertRolePermission,
  userPermissions, type UserPermission, type InsertUserPermission,
  passwordHistory, type PasswordHistory
} from "@shared/schema";
import { nanoid } from "nanoid";
import { db, pool } from "./db";
import { eq, and, count, desc, sql, inArray } from "drizzle-orm";
import connectPg from "connect-pg-simple";
import session from "express-session";

// Storage interface - defines all required operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  // Whitelist operations
  getWhitelistedEmail(email: string): Promise<WhitelistedEmail | undefined>;
  addToWhitelist(whitelistData: InsertWhitelistedEmail): Promise<WhitelistedEmail>;
  getWhitelistedEmails(): Promise<WhitelistedEmail[]>;
  updateWhitelistedEmail(email: string, data: Partial<WhitelistedEmail>): Promise<WhitelistedEmail | undefined>;
  addWhitelistedEmail(email: string, invitedBy: number): Promise<WhitelistedEmail>;
  removeWhitelistedEmail(id: number): Promise<void>;
  removeFromWhitelist(invitationId: number): Promise<void>;

  // Additional methods needed for interface compliance
  getCompletionStatus(sessionId: string): Promise<Record<number, boolean>>;
  getMaxRevealedStep(sessionId: string): Promise<number>;
  updateMaxRevealedStep(sessionId: string, maxRevealedStep: number): Promise<void>;
  updateStepCompletion(sessionId: string, stepId: number, completed: boolean): Promise<void>;

  // Step operations
  getAllSteps(): Promise<Step[]>;
  getActiveSteps(): Promise<Step[]>;
  getStep(id: number): Promise<Step | undefined>;
  createStep(step: InsertStep): Promise<Step>;
  updateStep(id: number, stepData: Partial<Step>): Promise<Step>;
  updateStepsOrder(stepsToUpdate: Array<{ id: number; order: number }>): Promise<void>;
  deleteStep(id: number): Promise<void>;
  getStepDependencies(id: number): Promise<{ count: number, sessions: number, messages: number, inputs: number, outputs: number }>;

  // Session operations
  createSession(sessionData: Omit<InsertSession, "sessionId">): Promise<Session>;
  getSession(sessionId: string): Promise<Session | undefined>;
  getUserSessions(userId: number): Promise<Session[]>;
  getUserActiveSession(userId: number): Promise<Session | undefined>;
  updateSessionStep(sessionId: string, stepId: number): Promise<Session>;
  completeSession(sessionId: string): Promise<Session>;

  // Message operations
  addMessage(messageData: InsertMessage): Promise<Message>;
  getMessages(sessionId: string, stepId: number): Promise<Message[]>;
  getMessagesBySessionAndStep(sessionId: string, stepId: number): Promise<Message[]>;
  clearStepMessages(sessionId: string, stepId: number): Promise<void>;

  // Step input operations
  getStepInputs(sessionId: string, stepId: number): Promise<StepInput[]>;
  saveStepInput(inputData: InsertStepInput): Promise<StepInput>;
  updateStepInput(sessionId: string, stepId: number, fieldName: string, fieldValue: string): Promise<StepInput>;
  clearStepInputs(sessionId: string, stepId: number): Promise<void>;

  // Step output operations  
  getStepOutput(sessionId: string, stepId: number): Promise<StepOutput | undefined>;
  getSessionOutput(sessionId: string, stepId: number): Promise<StepOutput | undefined>;
  getStepOutputByVariable(sessionId: string, variableName: string): Promise<StepOutput | undefined>;
  saveStepOutput(outputData: InsertStepOutput): Promise<StepOutput>;
  updateStepOutput(sessionId: string, stepId: number, output: any, variableName: string): Promise<StepOutput>;
  getAllStepOutputs(sessionId: string): Promise<StepOutput[]>;
  deleteStepOutput(sessionId: string, stepId: number): Promise<void>;
  clearStepOutput(sessionId: string, stepId: number): Promise<void>;
  getOutputByVariable(sessionId: string, variableName: string): Promise<any>;

  // Blueprint operations
  getBlueprint(sessionId: string): Promise<Blueprint | undefined>;
  getUserBlueprints(userId: number): Promise<Blueprint[]>;
  getAllBlueprints(): Promise<Blueprint[]>;
  saveBlueprint(blueprintData: InsertBlueprint): Promise<Blueprint>;

  // User data management
  clearUserData(userId: number): Promise<void>;

  // Session storage for auth
  sessionStore: any;

  // Test infrastructure operations (development only)
  getAllTestRuns(): Promise<any[]>;
  getTestRun(id: number): Promise<any | undefined>;
  createTestRun(data: any): Promise<any>;
  updateTestRun(id: number, data: any): Promise<any>;

  // System settings operations
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  setSystemSetting(key: string, value: string, description?: string, updatedBy?: number): Promise<SystemSetting>;
  getAllSystemSettings(): Promise<SystemSetting[]>;
  getAdminVariables(): Promise<Record<string, any>>;
  updateAdminVariables(variables: Record<string, any>, updatedBy?: number): Promise<void>;

  // Enhanced authentication operations
  updateUserLoginAttempts(userId: number, attempts: number, lockoutEndsAt?: Date): Promise<void>;
  resetUserLoginAttempts(userId: number): Promise<void>;
  updateUserLastLogin(userId: number): Promise<void>;
  getPasswordHistory(userId: number, limit: number): Promise<PasswordHistory[]>;
  addPasswordHistory(userId: number, passwordHash: string): Promise<void>;
  
  // User session operations
  createUserSession(sessionData: InsertUserSession): Promise<UserSession>;
  getUserSession(sessionId: string): Promise<UserSession | undefined>;
  getUserActiveSessions(userId: number): Promise<UserSession[]>;
  updateSessionActivity(sessionId: string): Promise<void>;
  refreshUserSession(sessionId: string, expiresAt: Date): Promise<void>;
  deactivateUserSession(sessionId: string): Promise<void>;
  deactivateAllUserSessions(userId: number, excludeSessionId?: string): Promise<void>;
  
  // Audit logging
  createAuditLog(auditData: InsertAuditLog): Promise<AuditLog>;
  getUserAuditLogs(userId: number, limit?: number): Promise<AuditLog[]>;
  getAuditLogs(limit?: number, entityType?: string): Promise<AuditLog[]>;
  
  // Permission management
  createPermission(permissionData: InsertPermission): Promise<Permission>;
  getPermissions(): Promise<Permission[]>;
  getPermission(id: number): Promise<Permission | undefined>;
  updatePermission(id: number, data: Partial<Permission>): Promise<Permission>;
  deletePermission(id: number): Promise<void>;
  
  // Role permission management
  addRolePermission(rolePermissionData: InsertRolePermission): Promise<RolePermission>;
  getRolePermissions(role: string): Promise<Permission[]>;
  removeRolePermission(role: string, permissionId: number): Promise<void>;
  
  // User permission management
  addUserPermission(userPermissionData: InsertUserPermission): Promise<UserPermission>;
  getUserPermissions(userId: number): Promise<Permission[]>;
  removeUserPermission(userId: number, permissionId: number): Promise<void>;
  
  // Two-factor authentication
  updateUserTwoFactor(userId: number, secret: string | null, enabled: boolean): Promise<void>;
  storeTwoFactorBackupCodes(userId: number, hashedCodes: string[]): Promise<void>;
  clearTwoFactorBackupCodes(userId: number): Promise<void>;
  
  // User profile management
  updateUserProfile(userId: number, profileData: Partial<User>): Promise<User>;
  updateUserEmail(userId: number, newEmail: string, verificationToken: string, tokenExpires: Date): Promise<void>;
  verifyUserEmail(userId: number, token: string): Promise<boolean>;
  updateUserPreferences(userId: number, preferences: any): Promise<void>;
  getUserPreferences(userId: number): Promise<any>;
  
  // Bulk operations
  bulkUpdateUserRoles(userIds: number[], role: string): Promise<void>;
  bulkDeactivateUsers(userIds: number[]): Promise<void>;
  exportUserData(userId: number): Promise<any>;
}

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  // getUserByUsername is the same as getUserByEmail since username is email
  async getUserByUsername(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  sessionStore: session.Store;

  constructor() {
    // Configure PostgreSQL session store for both dev and production
    this.sessionStore = new PostgresSessionStore({ 
      conString: process.env.DATABASE_URL,
      tableName: 'session',  // Use 'session' table (not 'sessions')
      createTableIfMissing: false,
      ttl: 7 * 24 * 60 * 60, // 7 days in seconds
      schemaName: 'public'
    });
    
    // Initialize default steps if they don't exist
    this.initializeDefaultSteps();
  }

  private async initializeDefaultSteps() {
    // Database is the single source of truth - no hardcoded initialization
    // All steps should be created through the admin interface only
    return;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db.update(users)
      .set({
        ...userData,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  // Whitelist methods
  async getWhitelistedEmail(email: string): Promise<WhitelistedEmail | undefined> {
    const [whitelisted] = await db.select()
      .from(whitelistedEmails)
      .where(eq(whitelistedEmails.email, email));
    return whitelisted;
  }

  async addToWhitelist(whitelistData: InsertWhitelistedEmail): Promise<WhitelistedEmail> {
    const [whitelisted] = await db.insert(whitelistedEmails)
      .values({
        ...whitelistData,
        invitationSent: false,
        createdAt: new Date()
      })
      .returning();
    return whitelisted;
  }

  async getWhitelistedEmails(): Promise<WhitelistedEmail[]> {
    return db.select().from(whitelistedEmails);
  }

  async updateWhitelistedEmail(email: string, data: Partial<WhitelistedEmail>): Promise<WhitelistedEmail | undefined> {
    const [updated] = await db.update(whitelistedEmails)
      .set(data)
      .where(eq(whitelistedEmails.email, email))
      .returning();
    return updated;
  }

  // Step methods
  async getAllSteps(): Promise<Step[]> {
    return db.select().from(steps).orderBy(steps.order);
  }

  async getActiveSteps(): Promise<Step[]> {
    return db.select().from(steps).where(eq(steps.isActive, true)).orderBy(steps.order);
  }

  async getStep(id: number): Promise<Step | undefined> {
    const [step] = await db.select().from(steps).where(eq(steps.id, id));
    return step;
  }

  async getStepById(id: number): Promise<Step | undefined> {
    const [step] = await db.select().from(steps).where(eq(steps.id, id));
    return step;
  }

  async createStep(step: InsertStep): Promise<Step> {
    const [newStep] = await db.insert(steps).values(step).returning();
    return newStep;
  }
  
  async updateStep(id: number, stepData: Partial<Step>): Promise<Step> {
    console.error(`🎯 DB STORAGE: Updating step ${id}`);
    console.error(`🎯 DB STORAGE: stepData received:`, JSON.stringify(stepData, null, 2));
    
    // Create a completely clean stepData object with only safe fields
    const safeFields = [
      'title', 'description', 'gptPrompt', 'gptInstructionsLink', 
      'additionalContextLink', 'isGptStep', 'inputFields', 'inputVariables',
      'conversationStarters', 'outputVariable', 'order', 'isActive'
    ];
    
    const cleanStepData: any = {
      lastModified: new Date() // Always set current timestamp for updates
    };
    
    // Only copy safe fields from stepData
    safeFields.forEach(field => {
      if (stepData[field as keyof Step] !== undefined) {
        cleanStepData[field] = stepData[field as keyof Step];
      }
    });
    
    console.error(`🎯 DB STORAGE: Clean step data to update:`, JSON.stringify(cleanStepData, null, 2));
    
    const [updatedStep] = await db.update(steps)
      .set(cleanStepData)
      .where(eq(steps.id, id))
      .returning();
    
    if (!updatedStep) {
      throw new Error(`Step with ID ${id} not found`);
    }
    
    console.error(`🎯 DB STORAGE: Successfully updated step ${id}`);
    
    return updatedStep;
  }

  async updateStepsOrder(stepsToUpdate: Array<{ id: number; order: number }>): Promise<void> {
    console.error(`🎯 DB STORAGE: Updating order for ${stepsToUpdate.length} steps`);
    
    for (const step of stepsToUpdate) {
      await db.update(steps)
        .set({ order: step.order })
        .where(eq(steps.id, step.id));
    }
  }
  
  async deleteStep(id: number): Promise<void> {
    // Delete related messages
    await db.delete(messages).where(eq(messages.stepId, id));
    
    // Delete related inputs
    await db.delete(stepInputs).where(eq(stepInputs.stepId, id));
    
    // Delete related outputs
    await db.delete(stepOutputs).where(eq(stepOutputs.stepId, id));
    
    // Delete the step itself
    await db.delete(steps).where(eq(steps.id, id));
  }
  
  async getStepDependencies(id: number): Promise<{ count: number, sessions: number, messages: number, inputs: number, outputs: number }> {
    // Get count of sessions using this step
    const sessionCount = await db
      .select({ count: count() })
      .from(sessions)
      .where(eq(sessions.currentStepId, id));
    
    // Get count of messages
    const messageCount = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.stepId, id));
    
    // Get count of inputs
    const inputCount = await db
      .select({ count: count() })
      .from(stepInputs)
      .where(eq(stepInputs.stepId, id));
    
    // Get count of outputs
    const outputCount = await db
      .select({ count: count() })
      .from(stepOutputs)
      .where(eq(stepOutputs.stepId, id));
    
    const sessionsCount = Number(sessionCount[0]?.count) || 0;
    const messagesCount = Number(messageCount[0]?.count) || 0;
    const inputsCount = Number(inputCount[0]?.count) || 0;
    const outputsCount = Number(outputCount[0]?.count) || 0;
    
    return {
      count: sessionsCount + messagesCount + inputsCount + outputsCount,
      sessions: sessionsCount,
      messages: messagesCount,
      inputs: inputsCount,
      outputs: outputsCount
    };
  }

  // Session methods
  async createSession(sessionData: Omit<InsertSession, "sessionId">): Promise<Session> {
    const sessionId = nanoid();
    const [session] = await db.insert(sessions)
      .values({
        sessionId,
        userId: sessionData.userId,
        currentStepId: sessionData.currentStepId,
        completed: sessionData.completed || false,
        createdAt: new Date()
      })
      .returning();
    return session;
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const [session] = await db.select()
      .from(sessions)
      .where(eq(sessions.sessionId, sessionId));
    return session;
  }

  async getUserSessions(userId: number): Promise<Session[]> {
    return db.select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(sessions.createdAt);
  }

  async getUserActiveSession(userId: number): Promise<Session | undefined> {
    // Get the most recent uncompleted session for this user
    // This represents the session they're currently working on
    const [recentSession] = await db.select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.completed, false)))
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    
    console.log('🎯 ACTIVE SESSION: Found for user', userId, ':', recentSession?.sessionId || 'none');
    return recentSession;
  }

  async updateSessionStep(sessionId: string, stepId: number): Promise<Session> {
    const [updatedSession] = await db.update(sessions)
      .set({ currentStepId: stepId })
      .where(eq(sessions.sessionId, sessionId))
      .returning();
    
    if (!updatedSession) {
      throw new Error("Session not found");
    }
    
    return updatedSession;
  }

  async completeSession(sessionId: string): Promise<Session> {
    const [completedSession] = await db.update(sessions)
      .set({ completed: true })
      .where(eq(sessions.sessionId, sessionId))
      .returning();
    
    if (!completedSession) {
      throw new Error("Session not found");
    }
    
    return completedSession;
  }

  // Message methods
  async getMessages(sessionId: string, stepId: number): Promise<Message[]> {
    return db.select()
      .from(messages)
      .where(
        and(
          eq(messages.sessionId, sessionId),
          eq(messages.stepId, stepId)
        )
      )
      .orderBy(messages.timestamp);
  }

  async getMessagesBySessionAndStep(sessionId: string, stepId: number): Promise<Message[]> {
    return this.getMessages(sessionId, stepId);
  }

  async addMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages)
      .values({
        ...message,
        timestamp: message.timestamp || new Date()
      })
      .returning();
    return newMessage;
  }
  
  async clearStepMessages(sessionId: string, stepId: number): Promise<void> {
    await db.delete(messages)
      .where(
        and(
          eq(messages.sessionId, sessionId),
          eq(messages.stepId, stepId)
        )
      );
  }

  // Step input methods
  async getStepInputs(sessionId: string, stepId: number): Promise<StepInput[]> {
    return db.select()
      .from(stepInputs)
      .where(
        and(
          eq(stepInputs.sessionId, sessionId),
          eq(stepInputs.stepId, stepId)
        )
      );
  }

  async saveStepInput(input: InsertStepInput): Promise<StepInput> {
    // Check if an input with the same field name already exists
    const existingInputs = await db.select()
      .from(stepInputs)
      .where(
        and(
          eq(stepInputs.sessionId, input.sessionId),
          eq(stepInputs.stepId, input.stepId),
          eq(stepInputs.fieldName, input.fieldName)
        )
      );
    
    if (existingInputs.length > 0) {
      // Update existing input
      const [updatedInput] = await db.update(stepInputs)
        .set({
          fieldValue: input.fieldValue,
          timestamp: input.timestamp || new Date()
        })
        .where(
          and(
            eq(stepInputs.sessionId, input.sessionId),
            eq(stepInputs.stepId, input.stepId),
            eq(stepInputs.fieldName, input.fieldName)
          )
        )
        .returning();
      return updatedInput;
    } else {
      // Create new input
      const [newInput] = await db.insert(stepInputs)
        .values({
          ...input,
          timestamp: input.timestamp || new Date()
        })
        .returning();
      return newInput;
    }
  }

  async updateStepInput(sessionId: string, stepId: number, fieldName: string, fieldValue: string): Promise<StepInput> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    return this.saveStepInput({
      sessionId,
      userId: session.userId,
      stepId,
      fieldName,
      fieldValue,
      timestamp: new Date()
    });
  }

  async clearStepInputs(sessionId: string, stepId: number): Promise<void> {
    await db.delete(stepInputs)
      .where(
        and(
          eq(stepInputs.sessionId, sessionId),
          eq(stepInputs.stepId, stepId)
        )
      );
  }

  // Step output methods
  async getStepOutput(sessionId: string, stepId: number): Promise<StepOutput | undefined> {
    const [output] = await db.select()
      .from(stepOutputs)
      .where(
        and(
          eq(stepOutputs.sessionId, sessionId),
          eq(stepOutputs.stepId, stepId)
        )
      );
    return output;
  }

  // Add missing methods for unified routes
  async getSessionOutput(sessionId: string, stepId: number): Promise<StepOutput | undefined> {
    return this.getStepOutput(sessionId, stepId);
  }

  async getCompletionStatus(sessionId: string): Promise<Record<number, boolean>> {
    const outputs = await this.getAllStepOutputs(sessionId);
    const status: Record<number, boolean> = {};
    
    outputs.forEach((output: StepOutput) => {
      status[output.stepId] = true;
    });
    
    return status;
  }

  // Add missing whitelist methods
  async addWhitelistedEmail(email: string, invitedBy: number): Promise<WhitelistedEmail> {
    const [result] = await db.insert(whitelistedEmails).values({
      email,
      invitedBy
    }).returning();
    return result;
  }

  async removeWhitelistedEmail(id: number): Promise<void> {
    await db.delete(whitelistedEmails).where(eq(whitelistedEmails.id, id));
  }

  async getStepOutputByVariable(sessionId: string, variableName: string): Promise<StepOutput | undefined> {
    const [output] = await db.select()
      .from(stepOutputs)
      .where(
        and(
          eq(stepOutputs.sessionId, sessionId),
          eq(stepOutputs.variableName, variableName)
        )
      );
    return output;
  }

  async saveStepOutput(output: InsertStepOutput): Promise<StepOutput> {
    // Check if output already exists for this specific step AND variable name
    const [existingOutput] = await db.select()
      .from(stepOutputs)
      .where(
        and(
          eq(stepOutputs.sessionId, output.sessionId),
          eq(stepOutputs.stepId, output.stepId),
          eq(stepOutputs.variableName, output.variableName)  // FIXED: Also check variable name
        )
      );
    
    if (existingOutput) {
      // Update existing output only if session, step, AND variable name all match
      const [updatedOutput] = await db.update(stepOutputs)
        .set({
          output: output.output,
          generatedAt: output.generatedAt || new Date()
        })
        .where(
          and(
            eq(stepOutputs.sessionId, output.sessionId),
            eq(stepOutputs.stepId, output.stepId),
            eq(stepOutputs.variableName, output.variableName)  // FIXED: Match all three fields
          )
        )
        .returning();
      return updatedOutput;
    } else {
      // Create new output - this will prevent accidental overwrites
      const [newOutput] = await db.insert(stepOutputs)
        .values({
          ...output,
          generatedAt: output.generatedAt || new Date()
        })
        .returning();
      return newOutput;
    }
  }

  async updateStepOutput(sessionId: string, stepId: number, output: any, variableName: string): Promise<StepOutput> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // Make sure we have the user ID
    if (!session.userId) {
      throw new Error("Session has no associated user ID");
    }

    return this.saveStepOutput({
      sessionId,
      userId: session.userId,
      stepId,
      output,
      variableName,
      generatedAt: new Date()
    });
  }

  async getAllStepOutputs(sessionId: string): Promise<StepOutput[]> {
    return db.select()
      .from(stepOutputs)
      .where(eq(stepOutputs.sessionId, sessionId));
  }

  async deleteStepOutput(sessionId: string, stepId: number): Promise<void> {
    await db.delete(stepOutputs)
      .where(
        and(
          eq(stepOutputs.sessionId, sessionId),
          eq(stepOutputs.stepId, stepId)
        )
      );
  }

  async clearStepOutput(sessionId: string, stepId: number): Promise<void> {
    console.log(`🗑️ CLEAR OUTPUT: Deleting output for session ${sessionId}, step ${stepId}`);
    await db.delete(stepOutputs)
      .where(
        and(
          eq(stepOutputs.sessionId, sessionId),
          eq(stepOutputs.stepId, stepId)
        )
      );
  }

  // Blueprint methods
  async getBlueprint(sessionId: string): Promise<Blueprint | undefined> {
    const [blueprint] = await db.select()
      .from(blueprints)
      .where(eq(blueprints.sessionId, sessionId));
    return blueprint;
  }

  async getUserBlueprints(userId: number): Promise<Blueprint[]> {
    return db.select()
      .from(blueprints)
      .where(eq(blueprints.userId, userId))
      .orderBy(blueprints.generatedAt);
  }
  
  async getAllBlueprints(): Promise<Blueprint[]> {
    return db.select()
      .from(blueprints)
      .orderBy(blueprints.generatedAt);
  }

  async saveBlueprint(blueprintData: InsertBlueprint): Promise<Blueprint> {
    console.log(`🔍 DB STORAGE: Received blueprint data:`, JSON.stringify(blueprintData, null, 2));
    
    // Validate blueprint field
    if (!blueprintData.blueprint || blueprintData.blueprint === null || blueprintData.blueprint === undefined) {
      throw new Error(`Invalid blueprint data: blueprint field is ${blueprintData.blueprint}`);
    }
    
    // Check if blueprint already exists
    const existingBlueprint = await this.getBlueprint(blueprintData.sessionId);
    
    if (existingBlueprint) {
      console.log(`🔍 DB STORAGE: Updating existing blueprint for session ${blueprintData.sessionId}`);
      // Update existing blueprint
      const [updatedBlueprint] = await db.update(blueprints)
        .set({
          blueprint: blueprintData.blueprint,
          generatedAt: blueprintData.generatedAt || new Date()
        })
        .where(eq(blueprints.sessionId, blueprintData.sessionId))
        .returning();
      return updatedBlueprint;
    } else {
      console.log(`🔍 DB STORAGE: Creating new blueprint for session ${blueprintData.sessionId}`);
      // Create new blueprint - explicitly specify fields to avoid spread operator issues
      const [newBlueprint] = await db.insert(blueprints)
        .values({
          sessionId: blueprintData.sessionId,
          userId: blueprintData.userId,
          blueprint: blueprintData.blueprint,
          generatedAt: blueprintData.generatedAt || new Date()
        })
        .returning();
      return newBlueprint;
    }
  }

  // Add missing whitelist management function
  async removeFromWhitelist(invitationId: number): Promise<void> {
    await db.delete(whitelistedEmails)
      .where(eq(whitelistedEmails.id, invitationId));
  }

  async getMaxRevealedStep(sessionId: string): Promise<number> {
    const session = await this.getSession(sessionId);
    return session?.maxRevealedStep || 1;
  }

  async updateMaxRevealedStep(sessionId: string, maxRevealedStep: number): Promise<void> {
    await db.update(sessions)
      .set({ maxRevealedStep })
      .where(eq(sessions.sessionId, sessionId));
  }

  async updateStepCompletion(sessionId: string, stepId: number, completed: boolean): Promise<void> {
    // This would update step completion status in the session or create a step completion record
    // For now, we'll implement a basic version
    await db.update(sessions)
      .set({ currentStepId: stepId, completed })
      .where(eq(sessions.sessionId, sessionId));
  }

  async getOutputByVariable(sessionId: string, variableName: string): Promise<any> {
    const [output] = await db.select()
      .from(stepOutputs)
      .where(
        and(
          eq(stepOutputs.sessionId, sessionId),
          eq(stepOutputs.variableName, variableName)
        )
      );
    return output?.output || null;
  }

  async clearUserData(userId: number): Promise<void> {
    // Clear all user data from database in the correct order (foreign key constraints)
    await db.delete(messages).where(eq(messages.userId, userId));
    await db.delete(stepOutputs).where(eq(stepOutputs.userId, userId));
    await db.delete(stepInputs).where(eq(stepInputs.userId, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(blueprints).where(eq(blueprints.userId, userId));
  }

  // Test infrastructure operations (development only)
  async getAllTestRuns(): Promise<any[]> {
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    
    const { testRuns, testCases } = await import('@shared/schema');
    const runs = await db
      .select({
        id: testRuns.id,
        commitHash: testRuns.commitHash,
        branch: testRuns.branch,
        status: testRuns.status,
        totalTests: testRuns.totalTests,
        passedTests: testRuns.passedTests,
        failedTests: testRuns.failedTests,
        duration: testRuns.duration,
        startedAt: testRuns.startedAt,
        completedAt: testRuns.completedAt,
        errorSummary: testRuns.errorSummary,
      })
      .from(testRuns)
      .orderBy(desc(testRuns.startedAt))
      .limit(50);
    
    // Get test cases for each run
    const runsWithCases = await Promise.all(
      runs.map(async (run) => {
        const cases = await db
          .select()
          .from(testCases)
          .where(eq(testCases.testRunId, run.id));
        return { ...run, testCases: cases };
      })
    );
    
    return runsWithCases;
  }

  async getTestRun(id: number): Promise<any | undefined> {
    if (process.env.NODE_ENV === 'production') {
      return undefined;
    }
    
    const { testRuns, testCases } = await import('@shared/schema');
    const [run] = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, id));
    
    if (!run) return undefined;
    
    const cases = await db
      .select()
      .from(testCases)
      .where(eq(testCases.testRunId, id));
    
    return { ...run, testCases: cases };
  }

  async createTestRun(data: any): Promise<any> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test operations not available in production');
    }
    
    const { testRuns } = await import('@shared/schema');
    const [run] = await db
      .insert(testRuns)
      .values(data)
      .returning();
    
    return run;
  }

  async saveTestCases(testRunId: number, testCases: any[]): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test operations not available in production');
    }
    
    const { testCases: testCasesTable } = await import('@shared/schema');
    
    if (testCases.length > 0) {
      const casesData = testCases.map(testCase => ({
        testRunId,
        testSuite: testCase.suite || 'unknown',
        testName: testCase.name,
        status: testCase.status,
        duration: testCase.duration || 0,
        errorMessage: testCase.error,
        stackTrace: testCase.stackTrace
      }));
      
      await db.insert(testCasesTable).values(casesData);
    }
  }

  async getTestCases(testRunId: number): Promise<any[]> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test operations not available in production');
    }
    
    const { testCases } = await import('@shared/schema');
    return await db.select().from(testCases).where(eq(testCases.testRunId, testRunId));
  }

  async updateTestRun(id: number, data: any): Promise<any> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test operations not available in production');
    }
    
    const { testRuns } = await import('@shared/schema');
    const [run] = await db
      .update(testRuns)
      .set(data)
      .where(eq(testRuns.id, id))
      .returning();
    
    return run;
  }

  // System settings operations
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting;
  }

  async setSystemSetting(key: string, value: string, description?: string, updatedBy?: number): Promise<SystemSetting> {
    const existingSetting = await this.getSystemSetting(key);
    
    if (existingSetting) {
      // Update existing setting
      const [updated] = await db
        .update(systemSettings)
        .set({ 
          value, 
          description: description || existingSetting.description,
          updatedAt: new Date(),
          updatedBy 
        })
        .where(eq(systemSettings.key, key))
        .returning();
      return updated;
    } else {
      // Create new setting
      const [created] = await db
        .insert(systemSettings)
        .values({ key, value, description, updatedBy })
        .returning();
      return created;
    }
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return await db.select().from(systemSettings);
  }

  async getAdminVariables(): Promise<Record<string, any>> {
    const settings = await this.getAllSystemSettings();
    const variables: Record<string, any> = {};
    
    // Convert settings to key-value pairs
    for (const setting of settings) {
      let value: any = setting.value;
      
      // Parse boolean and numeric values
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(Number(value)) && value !== '') value = Number(value);
      
      variables[setting.key] = value;
    }
    
    // Add OpenAI API key (masked for security)
    variables.openaiApiKey = process.env.OPENAI_API_KEY ? '***' : null;
    variables.defaultModel = variables.defaultModel || 'gpt-4';
    variables.maxTokens = variables.maxTokens || 2000;
    
    return variables;
  }

  async updateAdminVariables(variables: Record<string, any>, updatedBy?: number): Promise<void> {
    console.log('🔧 MIDDLEWARE: Updating admin variables:', Object.keys(variables));
    
    for (const [key, value] of Object.entries(variables)) {
      // Skip OpenAI API key as it's environment-based
      if (key === 'openaiApiKey') continue;
      
      await this.setSystemSetting(key, String(value), undefined, updatedBy);
    }
  }

  // Enhanced authentication operations
  async updateUserLoginAttempts(userId: number, attempts: number, lockoutEndsAt?: Date): Promise<void> {
    await db.update(users)
      .set({ 
        failedLoginAttempts: attempts, 
        accountLockedUntil: lockoutEndsAt 
      })
      .where(eq(users.id, userId));
  }

  async resetUserLoginAttempts(userId: number): Promise<void> {
    await db.update(users)
      .set({ 
        failedLoginAttempts: 0, 
        accountLockedUntil: null 
      })
      .where(eq(users.id, userId));
  }

  async updateUserLastLogin(userId: number): Promise<void> {
    await db.update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, userId));
  }

  async getPasswordHistory(userId: number, limit: number): Promise<PasswordHistory[]> {
    return await db.select()
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(limit);
  }

  async addPasswordHistory(userId: number, passwordHash: string): Promise<void> {
    await db.insert(passwordHistory).values({
      userId,
      passwordHash
    });
  }

  // User session operations
  async createUserSession(sessionData: InsertUserSession): Promise<UserSession> {
    const [session] = await db.insert(userSessions)
      .values(sessionData)
      .returning();
    return session;
  }

  async getUserSession(sessionId: string): Promise<UserSession | undefined> {
    const [session] = await db.select()
      .from(userSessions)
      .where(eq(userSessions.sessionId, sessionId));
    return session;
  }

  async getUserActiveSessions(userId: number): Promise<UserSession[]> {
    return await db.select()
      .from(userSessions)
      .where(and(
        eq(userSessions.userId, userId),
        eq(userSessions.isActive, true)
      ))
      .orderBy(desc(userSessions.lastActivity));
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    await db.update(userSessions)
      .set({ lastActivity: new Date() })
      .where(eq(userSessions.sessionId, sessionId));
  }

  async refreshUserSession(sessionId: string, expiresAt: Date): Promise<void> {
    await db.update(userSessions)
      .set({ 
        expiresAt,
        lastActivity: new Date()
      })
      .where(eq(userSessions.sessionId, sessionId));
  }

  async deactivateUserSession(sessionId: string): Promise<void> {
    await db.update(userSessions)
      .set({ isActive: false })
      .where(eq(userSessions.sessionId, sessionId));
  }

  async deactivateAllUserSessions(userId: number, excludeSessionId?: string): Promise<void> {
    const conditions = [eq(userSessions.userId, userId)];
    if (excludeSessionId) {
      conditions.push(sql`${userSessions.sessionId} != ${excludeSessionId}`);
    }
    
    await db.update(userSessions)
      .set({ isActive: false })
      .where(and(...conditions));
  }

  // Audit logging
  async createAuditLog(auditData: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs)
      .values(auditData)
      .returning();
    return log;
  }

  async getUserAuditLogs(userId: number, limit: number = 50): Promise<AuditLog[]> {
    return await db.select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  async getAuditLogs(limit: number = 100, entityType?: string): Promise<AuditLog[]> {
    const conditions = [];
    if (entityType) {
      conditions.push(eq(auditLogs.entityType, entityType));
    }

    return await db.select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  // Permission management
  async createPermission(permissionData: InsertPermission): Promise<Permission> {
    const [permission] = await db.insert(permissions)
      .values(permissionData)
      .returning();
    return permission;
  }

  async getPermissions(): Promise<Permission[]> {
    return await db.select().from(permissions);
  }

  async getPermission(id: number): Promise<Permission | undefined> {
    const [permission] = await db.select()
      .from(permissions)
      .where(eq(permissions.id, id));
    return permission;
  }

  async updatePermission(id: number, data: Partial<Permission>): Promise<Permission> {
    const [permission] = await db.update(permissions)
      .set(data)
      .where(eq(permissions.id, id))
      .returning();
    return permission;
  }

  async deletePermission(id: number): Promise<void> {
    await db.delete(permissions).where(eq(permissions.id, id));
  }

  // Role permission management
  async addRolePermission(rolePermissionData: InsertRolePermission): Promise<RolePermission> {
    const [rolePermission] = await db.insert(rolePermissions)
      .values(rolePermissionData)
      .returning();
    return rolePermission;
  }

  async getRolePermissions(role: string): Promise<Permission[]> {
    return await db.select({ 
      id: permissions.id,
      name: permissions.name,
      description: permissions.description,
      resource: permissions.resource,
      action: permissions.action,
      createdAt: permissions.createdAt
    })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.role, role));
  }

  async removeRolePermission(role: string, permissionId: number): Promise<void> {
    await db.delete(rolePermissions)
      .where(and(
        eq(rolePermissions.role, role),
        eq(rolePermissions.permissionId, permissionId)
      ));
  }

  // User permission management
  async addUserPermission(userPermissionData: InsertUserPermission): Promise<UserPermission> {
    const [userPermission] = await db.insert(userPermissions)
      .values(userPermissionData)
      .returning();
    return userPermission;
  }

  async getUserPermissions(userId: number): Promise<Permission[]> {
    return await db.select({
      id: permissions.id,
      name: permissions.name,
      description: permissions.description,
      resource: permissions.resource,
      action: permissions.action,
      createdAt: permissions.createdAt
    })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(and(
        eq(userPermissions.userId, userId),
        eq(userPermissions.granted, true),
        sql`(${userPermissions.expiresAt} IS NULL OR ${userPermissions.expiresAt} > NOW())`
      ));
  }

  async removeUserPermission(userId: number, permissionId: number): Promise<void> {
    await db.delete(userPermissions)
      .where(and(
        eq(userPermissions.userId, userId),
        eq(userPermissions.permissionId, permissionId)
      ));
  }

  // Two-factor authentication
  async updateUserTwoFactor(userId: number, secret: string | null, enabled: boolean): Promise<void> {
    await db.update(users)
      .set({ 
        twoFactorSecret: secret,
        twoFactorEnabled: enabled
      })
      .where(eq(users.id, userId));
  }

  async storeTwoFactorBackupCodes(userId: number, hashedCodes: string[]): Promise<void> {
    await db.update(users)
      .set({ twoFactorBackupCodes: hashedCodes })
      .where(eq(users.id, userId));
  }

  async clearTwoFactorBackupCodes(userId: number): Promise<void> {
    await db.update(users)
      .set({ twoFactorBackupCodes: null })
      .where(eq(users.id, userId));
  }

  // User profile management
  async updateUserProfile(userId: number, profileData: Partial<User>): Promise<User> {
    const [user] = await db.update(users)
      .set(profileData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserEmail(userId: number, newEmail: string, verificationToken: string, tokenExpires: Date): Promise<void> {
    await db.update(users)
      .set({ 
        pendingEmail: newEmail,
        emailVerificationToken: verificationToken,
        emailTokenExpires: tokenExpires
      })
      .where(eq(users.id, userId));
  }

  async verifyUserEmail(userId: number, token: string): Promise<boolean> {
    const [user] = await db.select()
      .from(users)
      .where(and(
        eq(users.id, userId),
        eq(users.emailVerificationToken, token),
        sql`${users.emailTokenExpires} > NOW()`
      ));

    if (!user) return false;

    await db.update(users)
      .set({
        email: user.pendingEmail,
        pendingEmail: null,
        emailVerificationToken: null,
        emailTokenExpires: null,
        emailVerified: true
      })
      .where(eq(users.id, userId));

    return true;
  }

  async updateUserPreferences(userId: number, preferences: any): Promise<void> {
    await db.update(users)
      .set({ preferences })
      .where(eq(users.id, userId));
  }

  async getUserPreferences(userId: number): Promise<any> {
    const [user] = await db.select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId));
    return user?.preferences || {};
  }

  // Bulk operations
  async bulkUpdateUserRoles(userIds: number[], role: string): Promise<void> {
    // inArray() with an empty array generates invalid SQL, so an empty bulk
    // call is a no-op rather than an error.
    if (userIds.length === 0) return;
    await db.update(users)
      .set({ role })
      .where(inArray(users.id, userIds));
  }

  async bulkDeactivateUsers(userIds: number[]): Promise<void> {
    if (userIds.length === 0) return;
    await db.update(users)
      .set({ 
        isActive: false,
        deactivatedAt: new Date()
      })
      .where(inArray(users.id, userIds));
  }

  async exportUserData(userId: number): Promise<any> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const userSessions = await this.getUserActiveSessions(userId);
    const auditLogs = await this.getUserAuditLogs(userId, 1000);
    const userPermissions = await this.getUserPermissions(userId);

    return {
      user,
      sessions: userSessions,
      auditLogs,
      permissions: userPermissions,
      exportedAt: new Date().toISOString()
    };
  }
}

// Export the storage instance
export const storage = new DatabaseStorage();