import * as vscode from 'vscode';
import { buildGradingSystemPrompt, PromptMode, DEFAULT_GRADING_SYSTEM_PROMPT, DEFAULT_HINT_PROMPT } from '../utils/prompt-builder';
import type { FirebaseService } from './firebase-service';

export interface GradingResult {
    grade: number;
    feedback: string;
}

interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

interface GeminiRequest {
    contents: GeminiMessage[];
    systemInstruction?: {
        parts: { text: string }[];
    };
}

interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[];
            role: string;
        };
    }[];
}

const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

export class GeminiService {
    constructor(
        private context: vscode.ExtensionContext,
        private firebase?: FirebaseService
    ) { }

    private getApiKey(): string | undefined {
        return vscode.workspace.getConfiguration('csLearningPlatform').get('geminiApiKey');
    }

    /**
     * Send a message to the Gemini API
     */
    async sendMessage(
        messages: { role: 'user' | 'assistant'; content: string }[],
        lessonContext?: string
    ): Promise<string> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('Gemini API Key is not configured. Please check your settings.');
        }

        const geminiMessages: GeminiMessage[] = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const requestBody: GeminiRequest = {
            contents: geminiMessages
        };

        if (lessonContext) {
            requestBody.systemInstruction = {
                parts: [{ text: lessonContext }]
            };
        }

        return this.makeRequest(apiKey, requestBody);
    }

    /**
     * Grade a student's answer
     */
    async gradeAnswer(
        question: string,
        studentAnswer: string,
        maxPoints: number,
        language?: string,
        conversationHistory?: string,
        customPromptTemplate?: string | null,
        gradingPromptMode?: PromptMode
    ): Promise<GradingResult> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('Gemini API Key is not configured. Please check your settings.');
        }

        const dbDefault = this.firebase
            ? await this.firebase.getSystemPrompt('grading', DEFAULT_GRADING_SYSTEM_PROMPT)
            : DEFAULT_GRADING_SYSTEM_PROMPT;
        const systemRules = buildGradingSystemPrompt(customPromptTemplate, maxPoints, gradingPromptMode, dbDefault);

        const gradingPrompt = conversationHistory
            ? `You previously graded a student's answer and then had a conversation with them about it. Re-evaluate the grade taking the full conversation into account.

**Question/Exercise:**
${question}

**Student's Answer:**
${studentAnswer}

**Maximum Points:** ${maxPoints}
${language ? `**Programming Language:** ${language}` : ''}

**Student's Dispute Messages:**
${conversationHistory}

**Your Task:**
Review the conversation above. If the student raised valid points that show their answer deserves a different score, adjust the grade accordingly. Be fair and consistent.

**Response Format (IMPORTANT - follow this exact format):**
GRADE: [number between 0 and ${maxPoints}]
FEEDBACK: [Explain your final grade, acknowledging any valid points the student raised]`
            : `**Question/Exercise:**
${question}

**Student's Answer:**
${studentAnswer}

**Maximum Points:** ${maxPoints}
${language ? `**Programming Language:** ${language}` : ''}

**Response Format (IMPORTANT - follow this exact format):**
GRADE: [number between 0 and ${maxPoints}]
FEEDBACK: [Your feedback]`;

        const requestBody: GeminiRequest = {
            contents: [{
                role: 'user',
                parts: [{ text: gradingPrompt }]
            }],
            systemInstruction: {
                parts: [{ text: systemRules }]
            }
        };

        const rawResponse = await this.makeRequest(apiKey, requestBody);
        // Strip hidden reasoning block the model sometimes includes in its output
        const responseText = rawResponse.replace(/<hidden_reasoning>[\s\S]*?<\/hidden_reasoning>/gi, '').trim();

        // Parse response
        const gradeMatch = responseText.match(/GRADE:\s*(\d+(?:\.\d+)?)/i);
        const feedbackMatch = responseText.match(/FEEDBACK:\s*([\s\S]*?)(?:$)/i);

        let grade = 0;
        let feedback = responseText;

        if (gradeMatch) {
            grade = Math.min(Math.max(parseFloat(gradeMatch[1]), 0), maxPoints);
        }

        if (feedbackMatch) {
            feedback = feedbackMatch[1].trim();
        }

        return { grade, feedback };
    }

    /**
     * Get a hint for a coding exercise without revealing the answer
     */
    async getHint(
        question: string,
        studentAnswer: string,
        language?: string
    ): Promise<string> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('Gemini API Key is not configured. Please check your settings.');
        }

        const hintSystem = this.firebase
            ? await this.firebase.getSystemPrompt('hint', DEFAULT_HINT_PROMPT)
            : DEFAULT_HINT_PROMPT;

        const hintUserMessage = `**Exercise/Question:**
${question}

**Student's Current Code:**
${studentAnswer}
${language ? `\n**Programming Language:** ${language}` : ''}`;

        const requestBody: GeminiRequest = {
            contents: [{ role: 'user', parts: [{ text: hintUserMessage }] }],
            systemInstruction: { parts: [{ text: hintSystem }] },
        };

        return this.makeRequest(apiKey, requestBody);
    }

    private async makeRequest(apiKey: string, body: GeminiRequest): Promise<string> {
        try {
            const endpoint = `${GEMINI_API_BASE}?key=${apiKey}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
            }

            const data: GeminiResponse = await response.json();

            if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]) {
                throw new Error('No response content from Gemini');
            }

            return data.candidates[0].content.parts[0].text;
        } catch (error: any) {
            console.error('Gemini Request Failed:', error);
            throw new Error(`Failed to communicate with AI: ${error.message}`);
        }
    }
}
