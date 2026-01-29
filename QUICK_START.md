# Quick Start Guide - CS Learning Platform Extension

## 🚀 Get Started in 3 Steps

### Step 1: Install & Sign In

1. Press **F5** to launch Extension Development Host
2. Open Command Palette: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
3. Type: **CS Platform: Sign In**
4. Choose authentication method:
   - **Sign in with Email/Password** (Recommended for now)
   - Sign in with Google (requires web app setup first)

### Step 2: Browse Courses

1. Look for **CS Learning** icon in left sidebar (book icon)
2. Click to open the courses panel
3. You'll see all your active courses listed

### Step 3: Start Learning

1. Expand a course → expand a topic → click a lesson
2. Extension automatically:
   - Creates workspace folder
   - Sets up git repository
   - Creates exercise files
   - Opens first exercise
3. Start coding! 💻

---

## 📁 Workspace Structure

Your files are organized like this:

```
~/cs-platform-workspace/
└── your-user-id/
    └── course-name/
        ├── README.md          ← Course info
        └── topics/
            └── topic-name/
                └── lesson-name/
                    ├── README.md      ← Lesson content
                    └── exercises/
                        ├── exercise_1_intro.py
                        ├── exercise_2_variables.py
                        └── exercise_3_loops.py
```

---

## 🎯 Key Commands

| Command | Shortcut | What It Does |
|---------|----------|--------------|
| **Sign In** | Cmd Palette | Authenticate with your account |
| **Sign Out** | Cmd Palette | Sign out |
| **Refresh Courses** | Click 🔄 in tree | Reload course list |

---

## 💡 Tips

### Tip 1: Exercises Never Overwrite
Once you edit an exercise file, it's yours. The extension **never overwrites** your work when you reopen a lesson.

### Tip 2: Custom Workspace Location
Change where files are saved:
1. Settings → Search "CS Learning Platform"
2. Change "Workspace Root"
3. Use `~` for home directory

### Tip 3: Multiple Languages Supported
- Python → `.py`
- Java → `.java`
- C# → `.cs`
- TypeScript → `.ts`
- JavaScript → `.js`

### Tip 4: Lesson README
Each lesson has a `README.md` with all content. Open it if you need to review instructions.

### Tip 5: Git Template
Some courses come with starter code from a git repository. It clones automatically the first time you open the course.

---

## 🐛 Troubleshooting

### "Please sign in first"
**Solution**: Run "CS Platform: Sign In" command

### Course tree is empty
**Solution**:
1. Make sure you're signed in
2. Click refresh button (🔄)
3. Check internet connection

### Exercise files not created
**Solution**:
1. Make sure lesson has code sections
2. Check console for errors
3. Try reopening the lesson

### Git clone taking forever
**Solution**: First clone is slow. Be patient. Subsequent opens are instant.

### My code was deleted!
**Solution**: This should never happen. Files are never overwritten. If it did, please report as a bug.

---

## 📚 What's Working (Phase 2)

✅ Course browser with tree view
✅ Automatic workspace creation
✅ Git template cloning
✅ Exercise file generation
✅ Lesson README generation
✅ Multi-language support
✅ Your work is preserved

## 🚧 Coming Soon

🔜 **Phase 3**: Automatic sync between VS Code and web app
🔜 **Phase 4**: Lesson content viewer with AI chat
🔜 **Phase 5**: Multi-language validation and testing

---

## 🆘 Need Help?

1. **Check Console Logs**: Help → Toggle Developer Tools → Console
2. **Read Documentation**: See `PHASE2_TESTING.md` for detailed testing
3. **Report Issues**: Include error messages and steps to reproduce

---

## 🎓 Learning Flow

```
Sign In → Browse Courses → Select Lesson → Code → Submit (Phase 3)
   ↓           ↓              ↓              ↓          ↓
Auth      Tree View      Workspace      Edit Files   Sync
Phase 1    Phase 2        Phase 2        Phase 2    Phase 3
```

---

**Current Phase**: ✅ Phase 2 Complete
**Next Phase**: 🔜 Phase 3 - Bi-directional Sync

Happy Learning! 🎉
