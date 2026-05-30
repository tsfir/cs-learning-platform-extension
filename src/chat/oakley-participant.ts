import * as vscode from 'vscode';
import { GeminiService } from '../services/gemini-service';
import { FirebaseService } from '../services/firebase-service';
import { DEFAULT_TUTORING_PROMPT } from '../utils/prompt-builder';

interface GradingRequest {
    courseId: string;
    lessonId: string;
    sectionId: string;
    question: string;
    studentAnswer: string;
    maxPoints: number;
    language: string;
    gradingPromptTemplate?: string | null;
    gradingPromptMode?: 'default' | 'extend' | 'override';
    gradingIndicator?: string;
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
                    await this.handleGrading(request, context, stream);
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

            const systemPrompt = await this.firebase.getSystemPrompt('tutoring', DEFAULT_TUTORING_PROMPT);

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

    private extractConversationHistory(history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>): string {
        if (history.length === 0) return '';

        // Only include free-text messages the student typed — skip grade/hint commands and all AI responses
        const disputeMessages = history
            .filter((turn): turn is vscode.ChatRequestTurn =>
                turn instanceof vscode.ChatRequestTurn &&
                turn.command !== 'grade' &&
                turn.command !== 'hint' &&
                turn.prompt.trim().length > 0
            )
            .map(turn => turn.prompt.trim());

        return disputeMessages.join('\n\n');
    }

    private async handleGrading(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream
    ) {
        if (!this.gradingContext) {
            stream.markdown("I don't see an exercise to grade right now. Please right-click an exercise in the Course tree and select 'Check Answer'.");
            return;
        }

        try {
            const ctx = this.gradingContext;
            const conversationHistory = this.extractConversationHistory(context.history);
            const isRegrade = conversationHistory.length > 0;

            stream.progress(isRegrade ? 'Re-evaluating your grade based on our conversation...' : 'Grading your answer...');

            // Call grading API, passing conversation history if this is a re-grade
            const result = await this.gemini.gradeAnswer(
                ctx.question,
                ctx.studentAnswer,
                ctx.maxPoints,
                ctx.language,
                isRegrade ? conversationHistory : undefined,
                ctx.gradingPromptTemplate,
                ctx.gradingPromptMode,
                ctx.gradingIndicator
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
                    result.grade,
                    result.feedback,
                    ctx.maxPoints
                );
                stream.markdown('\n\n*(Grade saved to your progress)*');
            }

            // Clear context after grading
            this.gradingContext = undefined;

            // Move focus to chat panel so the user can read/interact with the response
            await vscode.commands.executeCommand('workbench.panel.chat.view.focus');

        } catch (error: any) {
            stream.markdown(`Failed to grade exercise: ${error.message}`);
        }
    }
}
