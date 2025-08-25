# Contributing to Gemini PR Reviewer

Thank you for your interest in contributing to the Gemini PR Reviewer GitHub App! We welcome contributions from the community.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- GitHub account with permission to create GitHub Apps
- Google Gemini API key for testing
- Git installed and configured

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/gemini-pr-reviewer-github-app.git
   cd gemini-pr-reviewer-github-app
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up GitHub App** (for testing)
   - Follow the [GitHub App Setup Guide](GITHUB-APP-SETUP.md)
   - Create a test GitHub App for development
   - Install it on a test repository

4. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your test configuration
   ```

5. **Build and Test**
   ```bash
   npm run build
   npm start
   ```

## 🔧 Development Guidelines

### Code Style

- **TypeScript**: All new code should be written in TypeScript
- **ESLint**: Follow the existing linting rules
- **Formatting**: Use consistent formatting (we recommend Prettier)
- **Comments**: Document complex logic and public APIs

### Architecture

- **Modular Design**: Keep components focused and single-purpose
- **Error Handling**: Always handle errors gracefully
- **Logging**: Use descriptive console logs for debugging
- **Security**: Never expose sensitive information in logs

### Key Components

- `src/github-app-auth.ts` - GitHub App authentication and installation management
- `src/core-reviewer.ts` - AI review logic (maintain Gemini integration)
- `src/config-manager.ts` - Configuration and credential management
- `src/polling-server.ts` - Polling mode implementation
- `src/webhook-server.ts` - Webhook mode implementation

## 📝 Making Changes

### Branch Naming

- `feature/description` - New features
- `bugfix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

### Commit Messages

Use conventional commit format:
```
type(scope): description

Examples:
feat(auth): add installation discovery
fix(webhook): handle malformed payloads
docs(setup): update GitHub App instructions
```

### Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Write clear, focused commits
   - Add tests if applicable
   - Update documentation as needed

3. **Test Changes**
   ```bash
   npm run build
   npm run lint  # if available
   # Test manually with a test repository
   ```

4. **Submit Pull Request**
   - Use a clear, descriptive title
   - Fill out the PR template
   - Link any related issues
   - Request review from maintainers

## 🧪 Testing

### Manual Testing

1. **Set up a test repository** with sample PRs
2. **Install your test GitHub App** on the repository
3. **Test both polling and webhook modes**
4. **Verify AI reviews** are generated correctly
5. **Check error handling** with invalid configurations

### Test Cases

- [ ] New PR creation triggers review
- [ ] PR updates trigger new reviews
- [ ] Draft PRs are skipped
- [ ] Large files are handled appropriately
- [ ] API rate limits are respected
- [ ] Webhook signature verification works
- [ ] Installation permissions are checked

## 🐛 Reporting Issues

### Bug Reports

Please include:
- **Environment**: Node.js version, OS, deployment method
- **Configuration**: Redacted configuration details
- **Steps to Reproduce**: Clear reproduction steps
- **Expected vs Actual**: What should happen vs what actually happens
- **Logs**: Relevant log output (remove sensitive information)

### Feature Requests

Please include:
- **Use Case**: Why is this feature needed?
- **Proposed Solution**: How should it work?
- **Alternatives**: Any alternative approaches considered?
- **Implementation**: Suggestions for implementation (if any)

## 🔒 Security

### Reporting Security Issues

**Do not report security vulnerabilities through public GitHub issues.**

Instead, please report them privately:
1. Email the maintainers (if available)
2. Use GitHub's private vulnerability reporting
3. Provide detailed information about the vulnerability

### Security Considerations

- Never commit secrets or private keys
- Always validate webhook signatures
- Sanitize all user inputs
- Follow GitHub App security best practices
- Implement proper error handling to avoid information leaks

## 📚 Documentation

### Documentation Updates

- Update relevant documentation when making changes
- Keep code comments up to date
- Update the CHANGELOG.md for notable changes
- Ensure setup guides remain accurate

### Documentation Standards

- Use clear, concise language
- Provide examples where helpful
- Include troubleshooting tips
- Keep formatting consistent

## 🎯 Areas for Contribution

### High Priority

- **Enhanced AI Prompts**: Improve code review quality
- **Language Support**: Add support for more programming languages
- **Error Handling**: Better error messages and recovery
- **Performance**: Optimize processing for large PRs
- **Testing**: Add automated testing framework

### Medium Priority

- **UI Dashboard**: Web interface for configuration and monitoring
- **Metrics**: Usage analytics and review statistics
- **Integrations**: Support for other code quality tools
- **Templates**: Review comment templates and customization

### Low Priority

- **CLI Tools**: Command-line utilities for management
- **Docker Support**: Containerization improvements
- **Multi-language**: Internationalization support

## 📋 Code Review Checklist

Before submitting:

- [ ] Code builds without errors
- [ ] No sensitive information in commits
- [ ] Documentation updated if needed
- [ ] Manual testing completed
- [ ] Error handling implemented
- [ ] Code follows existing patterns
- [ ] Commit messages are clear
- [ ] PR description is complete

## 🤝 Community

### Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Documentation**: Check the README and setup guides first

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and contribute
- Follow GitHub's Community Guidelines

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Gemini PR Reviewer! Your contributions help make code reviews more intelligent and accessible for everyone.
