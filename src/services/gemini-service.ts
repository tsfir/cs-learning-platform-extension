import * as vscode from 'vscode';

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

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export class GeminiService {
    constructor(private context: vscode.ExtensionContext) { }

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
        language?: string
    ): Promise<GradingResult> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('Gemini API Key is not configured. Please check your settings.');
        }

        const gradingPrompt = `You are Oakley AI, a friendly and encouraging computer science tutor grading a student's answer.

**Question/Exercise:**
${question}

**Student's Answer:**
${studentAnswer}

**Maximum Points:** ${maxPoints}
${language ? `**Programming Language:** ${language}` : ''}

**Your Task:**
1. Evaluate the student's answer for correctness, completeness, and code quality
2. Award points from 0 to ${maxPoints} based on quality
3. Provide encouraging, constructive feedback

**Response Format (IMPORTANT - follow this exact format):**
GRADE: [number between 0 and ${maxPoints}]
FEEDBACK: [Your friendly, encouraging feedback explaining the grade and suggesting improvements if needed]

Remember to be encouraging and helpful.`;

        const requestBody: GeminiRequest = {
            contents: [{
                role: 'user',
                parts: [{ text: gradingPrompt }]
            }]
        };

        const responseText = await this.makeRequest(apiKey, requestBody);

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

        const hintPrompt = `You are Oakley AI, a friendly and encouraging computer science tutor helping a student who is stuck on a coding exercise.

**Exercise/Question:**
${question}

**Student's Current Code:**
${studentAnswer}

${language ? `**Programming Language:** ${language}` : ''}

**Your Task:**
Provide a helpful hint that will guide the student toward the solution WITHOUT giving away the answer directly.

**Guidelines for your hint:**
1. Identify what the student might be missing or doing incorrectly
2. Point them in the right direction with a conceptual hint
3. You may suggest what to think about or what concept to review
4. Do NOT provide the actual code solution
5. Keep it encouraging and supportive
6. Be concise (2-4 sentences max)

**Response:**
Provide only the hint, nothing else.`;

        const requestBody: GeminiRequest = {
            contents: [{
                role: 'user',
                parts: [{ text: hintPrompt }]
            }]
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
