import * as vscode from 'vscode';
import { GeminiService } from '../services/gemini-service';
import { FirebaseService } from '../services/firebase-service';

interface GradingRequest {
    courseId: string;
    lessonId: string;
    sectionId: string;
    question: string;
    studentAnswer: string;
    maxPoints: number;
    language: string;
}

interface HintRequest {
    question: string;
    studentAnswer: string;
    language: string;
}

export class OakleyChatParticipant {
    public static readonly PARTICIPANT_ID = 'easy-cs-learning-platform.oakley';
    private gradingContext: GradingRequest | undefined;
    private hintContext: HintRequest | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private gemini: GeminiService,
        private firebase: FirebaseService
    ) { }

    register() {
        const participant = vscode.chat.createChatParticipant(
            OakleyChatParticipant.PARTICIPANT_ID,
            async (request, context, stream, token) => {

                // Check if this is a hint request
                if (request.command === 'hint' || this.hintContext) {
                    await this.handleHint(request, stream);
                    return;
                }

                // Check if this is a grading request
                if (request.command === 'grade' || this.gradingContext) {
                    await this.handleGrading(request, stream);
                    return;
                }

                // Default: General Tutoring
                await this.handleTutoring(request, stream);
            }
        );

        participant.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'logo.svg');
        this.context.subscriptions.push(participant);
    }

    setGradingContext(context: GradingRequest) {
        this.gradingContext = context;
    }

    setHintContext(context: HintRequest) {
        this.hintContext = context;
    }

    private async handleTutoring(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream
    ) {
        try {
            stream.progress('Thinking...');

            // Build context from history
            // VS Code chat API doesn't expose full history in the request object directly 
            // in the same way, but let's assume single turn or minimal context for now.
            // We can use the prompt directly.

            const systemPrompt = `You are Oakley AI, a friendly and encouraging computer science tutor.
Help the student understand concepts. Be encouraging, clear, and concise.
Explain concepts in a beginner-friendly way. Do not give direct answers assignments.`;

            const response = await this.gemini.sendMessage([
                { role: 'user', content: request.prompt }
            ], systemPrompt);

            stream.markdown(response);
        } catch (error: any) {
            stream.markdown(`I'm sorry, I encountered an error: ${error.message}`);
        }
    }

    private async handleHint(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream
    ) {
        if (!this.hintContext) {
            stream.markdown("I don't see an exercise to provide a hint for right now. Please right-click an exercise in the Course tree and select 'Get Hint'.");
            return;
        }

        try {
            stream.progress('Thinking of a helpful hint...');
            const ctx = this.hintContext;

            // Call hint API
            const hint = await this.gemini.getHint(
                ctx.question,
                ctx.studentAnswer,
                ctx.language
            );

            stream.markdown(`## 💡 Hint\n\n${hint}`);

            // Clear context after providing hint
            this.hintContext = undefined;

        } catch (error: any) {
            stream.markdown(`Failed to get hint: ${error.message}`);
        }
    }

    private async handleGrading(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream
    ) {
        if (!this.gradingContext) {
            stream.markdown("I don't see an exercise to grade right now. Please right-click an exercise in the Course tree and select 'Check Answer'.");
            return;
        }

        try {
            stream.progress('Grading your answer...');
            const ctx = this.gradingContext;

            // Call grading API
            const result = await this.gemini.gradeAnswer(
                ctx.question,
                ctx.studentAnswer,
                ctx.maxPoints,
                ctx.language
            );

            stream.markdown(`## Grading Result\n\n`);
            stream.markdown(`**Score:** ${result.grade}/${ctx.maxPoints}\n\n`);
            stream.markdown(`### Feedback\n\n${result.feedback}`);

            // Save grade to Firebase
            const userId = this.firebase.getUserId();
            if (userId) {
                await this.firebase.saveStudentGrade(
                    ctx.lessonId,
                    ctx.sectionId,
                    userId,
                    result.grade, // We store the grade
                    result.feedback
                );
                stream.markdown('\n\n*(Grade saved to your progress)*');
            }

            // Clear context after grading
            this.gradingContext = undefined;

        } catch (error: any) {
            stream.markdown(`Failed to grade exercise: ${error.message}`);
        }
    }
}
