/**
 * Data models matching the web application's Firestore schema
 */

export interface Course {
  id: string;
  courseSlug?: string;
  courseName: string;
  category: string;
  level: string;
  image: string;
  description: string;
  durationHours: number;
  studentCount: number;
  createdBy: string;
  orderIndex: number;
  isActive: boolean;
  gitTemplateRepository?: string; // Git repo URL for project template
}

export interface Topic {
  id: string;
  courseId: string;
  topicSlug?: string;
  topicName: string;
  level: string;
  orderIndex: number;
}

export interface Lesson {
  id: string;
  topicId: string;
  lessonSlug?: string;
  courseId: string;
  lessonName: string;
  lessonType: 'content' | 'exercise' | 'quiz';
  orderIndex: number;
  isPublished?: boolean;
}

export interface Section {
  id: string;
  lessonId: string;
  title: string;
  content: string;
  type: 'text' | 'code' | 'video' | 'interactive';
  orderIndex: number;
  language?: string; // For code sections
  starterValue?: string; // Initial code for exercises
}

export interface StudentAnswer {
  id: string;
  sectionId: string;
  lessonId: string;
  courseId: string;
  userId: string;
  answer: string;
  type: 'code' | 'interactive';
  grade?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProgress {
  userId: string;
  courseId: string;
  completedLessons: string[];
  percentComplete: number;
  lastActivity: string;
}

export interface InputMetrics {
  keystrokeCount: number;
  pasteCount: number;
  pasteCharCount: number;
  editDurationMs: number;
  charCount: number;
  firstInputAt: string;
  lastInputAt: string;
}

export interface CodeSubmission {
  userId: string;
  lessonId: string;
  exerciseId: string;
  code: string;
  language: string;
  submittedAt: string;
  source: 'vscode' | 'web';
}

export interface AIChat {
  userId: string;
  lessonId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}
