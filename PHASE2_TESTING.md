# Phase 2 Testing Guide

## Prerequisites

1. Extension compiled successfully
2. User registered in web app with at least one active course
3. Some courses have `gitTemplateRepository` configured in Firestore

## How to Test

### 1. Launch Extension Development Host

1. Open extension project in VS Code
2. Press **F5** to launch Extension Development Host
3. New VS Code window opens with extension loaded

### 2. Sign In

1. Command Palette → "CS Platform: Sign In"
2. Choose sign-in method (Email/Password or Google)
3. Complete authentication
4. Verify: "Signed in as [email]" notification appears

## Test Cases

### Test 1: Course Tree View

#### Expected Behavior
- After signing in, course tree should populate automatically
- Shows only active courses (`isActive: true`)

#### Steps
1. Look at left sidebar
2. Find "CS Learning" activity bar icon
3. Click to open CS Learning panel
4. Verify course tree shows "Courses" view

#### Verification
- [ ] Course tree visible in left sidebar
- [ ] Shows course names
- [ ] Courses are expandable (+ icon)
- [ ] Course descriptions visible as tooltips
- [ ] Course levels shown as descriptions

### Test 2: Expand Course to See Topics

#### Steps
1. Click on any course in the tree
2. Course should expand showing topics
3. Verify topic names and labels

#### Verification
- [ ] Topics appear under expanded course
- [ ] Topic labels visible (e.g., "Module 1", "Week 1")
- [ ] Topics are expandable
- [ ] Folder icon for topics

### Test 3: Expand Topic to See Lessons

#### Steps
1. Expand a topic
2. Verify lessons appear

#### Verification
- [ ] Lessons appear under expanded topic
- [ ] Different icons for different types:
  - Content lessons: 📄 file-text icon
  - Exercise lessons: 🔧 debug-alt icon
  - Quiz lessons: ✓ checklist icon
- [ ] Lesson types shown as descriptions

### Test 4: Open Course Workspace

#### Steps
1. Click on a course in the tree
2. Wait for workspace creation

#### Verification
- [ ] Notification: "Initializing [Course Name] project..."
- [ ] If git template exists:
  - [ ] "Initializing from template..." message
  - [ ] Git clone completes
  - [ ] "Project initialized successfully!" message
- [ ] If no git template:
  - [ ] Basic project structure created
- [ ] VS Code switches to course workspace folder
- [ ] Folder structure visible in Explorer:
  ```
  course-name/
  ├── README.md
  ├── .gitignore
  ├── resources/
  └── topics/
  ```

### Test 5: Verify Git Template Cloning

**Prerequisites**: Course has `gitTemplateRepository` field in Firestore

#### Steps
1. Open a course with git template
2. Check Terminal output for git clone
3. Verify template files are present

#### Verification
- [ ] Git clone command executed
- [ ] Template files copied to workspace
- [ ] `.git` folder removed
- [ ] New git repo initialized
- [ ] Initial commit created
- [ ] Can run `git log` to see "Initial commit from template"

### Test 6: Open Lesson Workspace

#### Steps
1. In course tree, expand course → topic
2. Click on a lesson
3. Wait for lesson workspace creation

#### Verification
- [ ] Notification: "Opening lesson workspace..."
- [ ] Directory structure created:
  ```
  course-name/
  └── topics/
      └── topic-id/
          └── lesson-id/
              ├── README.md
              └── exercises/
                  ├── exercise_1_*.py
                  ├── exercise_2_*.py
                  └── ...
  ```
- [ ] Notification: "Lesson workspace ready!"
- [ ] Notification: "Created X exercise file(s)"
- [ ] First exercise file opens automatically

### Test 7: Verify Lesson README

#### Steps
1. Open a lesson (from Test 6)
2. Navigate to `topics/[topicId]/[lessonId]/README.md`
3. Open the file

#### Verification
- [ ] README contains "# Lesson Content" header
- [ ] All sections listed with titles
- [ ] Text sections show content
- [ ] Code sections show "Exercise: See `exercises/...`"
- [ ] Sections separated by `---`

### Test 8: Verify Exercise Files

#### Steps
1. Open a lesson with code sections
2. Navigate to `exercises/` folder
3. Check each exercise file

#### Verification
- [ ] One file per code section
- [ ] Files named: `exercise_[orderIndex]_[sanitized_title].[ext]`
- [ ] File extensions match language:
  - Python: `.py`
  - Java: `.java`
  - C#: `.cs`
  - TypeScript: `.ts`
  - JavaScript: `.js`
- [ ] If `boilerplateCode` exists: used as file content
- [ ] If no boilerplate: default comment header present

### Test 9: Exercise File Content

#### Steps
1. Open an exercise file
2. Check content

#### Example with boilerplate:
```python
# This is the boilerplate code from Firestore
def hello_world():
    # TODO: Complete this function
    pass
```

#### Example without boilerplate:
```python
# Exercise: Introduction to Variables
# TODO: Implement your solution here

```

#### Verification
- [ ] File not empty
- [ ] Proper comment syntax for language
- [ ] Exercise title in comment (if no boilerplate)
- [ ] Boilerplate code preserved exactly

### Test 10: File Naming Sanitization

#### Steps
1. Create lesson with code section: "Introduction to Python!"
2. Open lesson
3. Check exercise file name

#### Verification
- [ ] Special characters removed
- [ ] Spaces replaced with underscores
- [ ] Lowercase: `exercise_1_introduction_to_python.py`
- [ ] No leading/trailing underscores

### Test 11: Refresh Course Tree

#### Steps
1. Sign in and view courses
2. (In web app) Create a new active course
3. In extension: Command Palette → "CS Platform: Refresh Courses"

#### Verification
- [ ] Notification: "Courses refreshed"
- [ ] New course appears in tree
- [ ] Can also click refresh icon in tree view title

### Test 12: Multi-Language Support

#### Steps
1. Create lessons with different language sections:
   - Python
   - Java
   - C#
   - TypeScript
   - JavaScript
2. Open each lesson
3. Verify file extensions

#### Verification
- [ ] Python → `.py`
- [ ] Java → `.java`
- [ ] C# → `.cs`
- [ ] TypeScript → `.ts`
- [ ] JavaScript → `.js`

### Test 13: Empty Project Creation (No Git Template)

#### Steps
1. Open course without `gitTemplateRepository`
2. Verify project structure

#### Verification
- [ ] Notification: "No template found for this course. Creating empty project."
- [ ] Basic structure created:
  ```
  course-name/
  ├── README.md
  ├── .gitignore
  ├── resources/
  └── topics/
  ```
- [ ] README contains course info
- [ ] .gitignore has basic patterns
- [ ] Git initialized

### Test 14: Already Open Workspace

#### Steps
1. Open a course workspace
2. Click the same course in tree again

#### Verification
- [ ] Notification: "Already in [Course Name] workspace"
- [ ] Workspace does not reload
- [ ] No unnecessary operations

### Test 15: Not Signed In

#### Steps
1. Sign out: "CS Platform: Sign Out"
2. Look at course tree

#### Verification
- [ ] Course tree empty
- [ ] Notification: "Sign in to view courses" (when clicking tree)
- [ ] No courses displayed

### Test 16: Git Clone Failure Handling

**Simulate failure**: Use invalid git URL in `course.gitTemplateRepository`

#### Steps
1. In Firestore, set course git URL to invalid value
2. Try to open the course

#### Verification
- [ ] Error notification: "Failed to initialize project from template: [error]"
- [ ] Falls back to empty project creation
- [ ] Basic structure still created
- [ ] User can still use the workspace

### Test 17: Workspace Root Configuration

#### Steps
1. Open VS Code settings
2. Search "CS Learning Platform"
3. Change "Workspace Root" to custom path
4. Open a course

#### Verification
- [ ] Course created in custom path
- [ ] `~` expands to home directory
- [ ] Absolute paths work
- [ ] Structure still correct

### Test 18: File Already Exists

#### Steps
1. Open a lesson (creates exercise files)
2. Modify an exercise file
3. Close and reopen the same lesson

#### Verification
- [ ] Notification still says "Created X exercise file(s)"
- [ ] Existing files NOT overwritten
- [ ] User's changes preserved
- [ ] Console log: "Exercise file already exists: [filename]"

## Common Issues

### Issue: Course tree not showing

**Solution**:
- Make sure you're signed in
- Click refresh button in tree view
- Check console for errors
- Verify Firestore has active courses

### Issue: Git clone fails

**Solution**:
- Check internet connection
- Verify git is installed (`git --version`)
- Check git template URL is valid
- Extension falls back to empty project

### Issue: Exercise files not created

**Solution**:
- Check lesson has code sections in Firestore
- Verify sections have `type: 'code'`
- Check console logs for errors
- Verify permissions on workspace folder

### Issue: First exercise doesn't open automatically

**Solution**:
- This is normal if VS Code is switching workspaces
- Manually navigate to exercises folder
- File will open after workspace loads (1 second delay)

## Success Criteria

✅ **Phase 2 is successful if**:
- All active courses visible in tree
- Course workspace creates with/without git template
- Lesson workspace creates proper structure
- Exercise files created with correct names and content
- Git operations work (clone, init, commit)
- Proper error handling for failures
- User's existing files not overwritten

## Performance Notes

- Git clone time depends on template size
- First course open takes longest (template clone)
- Subsequent lessons open quickly (structure already exists)
- Large courses (many topics/lessons) may take longer to expand in tree

---

**Happy Testing!** 🎉

If you encounter any issues not covered here, check the console logs and report them.
