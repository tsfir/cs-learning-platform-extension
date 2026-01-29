import * as React from 'react';
import SectionItem from './SectionItem';

interface Props {
    sections: any[];
    vscode: any;
}

const LessonContent: React.FC<Props> = ({ sections, vscode }) => {
    if (!sections || sections.length === 0) {
        return <div>No content available for this lesson.</div>;
    }

    return (
        <div className="space-y-6">
            {sections.map((section, index) => (
                <SectionItem key={section.id || index} section={section} vscode={vscode} />
            ))}
        </div>
    );
};

export default LessonContent;
