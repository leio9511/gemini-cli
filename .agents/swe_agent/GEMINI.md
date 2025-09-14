# SWE Agent Development

This document outlines the development and testing process for the SWE (Software Engineering) Agent.

## Running Preflight Checks

To ensure the stability and correctness of the agent's orchestration logic, a self-contained preflight check is available. This command runs all necessary tests for this agent.

Before submitting any changes to the agent, please run the following command from the **root of the gemini-cli project**:

```bash
npm run preflight -w @google/gemini-cli-swe-agent-tests
```

Alternatively, you can navigate to the agent's directory and run it directly:

```bash
cd .agents/swe_agent/
npm run preflight
```
