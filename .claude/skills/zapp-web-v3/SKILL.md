```markdown
# zapp-web-v3 Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill documents the core development patterns and conventions for the `zapp-web-v3` TypeScript codebase. It covers file organization, code style, commit practices, and testing patterns to ensure consistency and maintainability across the project.

## Coding Conventions

### File Naming
- Use **snake_case** for all file names.
  - Example:  
    ```
    user_profile.ts
    order_service.test.ts
    ```

### Import Style
- Use **relative imports** for modules within the codebase.
  - Example:
    ```typescript
    import { getUser } from './user_service';
    ```

### Export Style
- Use **named exports** for all exported functions, classes, or constants.
  - Example:
    ```typescript
    // user_service.ts
    export function getUser(id: string) { ... }
    export const USER_ROLE = 'admin';
    ```

### Commit Patterns
- Follow **conventional commits** with the prefix `feat` for new features.
- Commit messages should be concise and descriptive (average ~82 characters).
  - Example:
    ```
    feat: add user authentication middleware to API endpoints
    ```

## Workflows

### Feature Development
**Trigger:** When adding a new feature  
**Command:** `/feature-development`

1. Create a new branch for your feature.
2. Implement the feature using TypeScript, following the coding conventions.
3. Add or update tests in a corresponding `*.test.*` file.
4. Commit your changes using the `feat` prefix in the commit message.
5. Open a pull request for review.

### Testing
**Trigger:** When verifying code correctness  
**Command:** `/run-tests`

1. Locate or create test files matching the `*.test.*` pattern.
2. Write tests for new or updated code.
3. Run the test suite using the project's test runner (framework unknown; check project docs or package.json).
4. Ensure all tests pass before merging changes.

## Testing Patterns

- Test files use the `*.test.*` naming convention.
  - Example:  
    ```
    user_service.test.ts
    ```
- The specific testing framework is not detected; refer to project documentation or `package.json` for details.
- Place tests alongside or near the modules they test.

## Commands
| Command              | Purpose                                      |
|----------------------|----------------------------------------------|
| /feature-development | Start a new feature development workflow     |
| /run-tests           | Run the test suite for the codebase          |
```