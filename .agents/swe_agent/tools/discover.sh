#!/bin/bash
set -e

cat <<EOF
[
  {
    "name": "get_task",
    "description": "Gets the next task or mission briefing from the stateless orchestration logic. Call this to get your goal.",
    "parameters": { "type": "OBJECT", "properties": {}, "required": [] }
  },
  {
    "name": "submit_work",
    "description": "The single gateway for all code verification. Has two modes: (1) To run a test, provide a 'test_command' and your 'expectation'. (2) To confirm the result of an ambiguous test run, provide your 'analysis_decision'. You are FORBIDDEN from using 'run_shell_command' to execute tests.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "summary": {
          "type": "STRING",
          "description": "A brief summary of the work you completed and its outcome."
        },
        "test_command": {
          "type": "STRING",
          "description": "The command to run. Omit this when providing an 'analysis_decision'."
        },
        "expectation": {
          "type": "STRING",
          "enum": ["PASS", "FAIL"],
          "description": "Your expectation for the test outcome. Omit this when providing an 'analysis_decision'."
        },
        "analysis_decision": {
          "type": "STRING",
          "enum": ["SUCCESS", "FAILURE"],
          "description": "Your final judgment after analyzing a 'NEEDS_ANALYSIS' response. Use 'SUCCESS' if the test failed as intended, 'FAILURE' otherwise."
        }
      },
      "required": ["summary"]
    }
  },
  {
    "name": "request_scope_reduction",
    "description": "Use this tool as an escape hatch when you conclude a task is too complex or ambiguous to be completed. This tool will revert all of your code changes to the last successful checkpoint and assign you a new task to break the original task down into smaller, more verifiable steps. This tool is locked until you have made several unsuccessful debugging attempts.",
    "parameters": { "type": "OBJECT", "properties": {}, "required": [] }
  },
  {
    "name": "escalate_for_external_help",
    "description": "Use this as a final escape hatch when you are stuck. This tool pauses the automated workflow and displays a detailed report to the human user, who will then provide guidance. You MUST generate a comprehensive markdown report detailing the problem, what you've tried, and relevant error messages. After calling this tool, the automated execution will STOP and wait for user input.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "markdown_report": {
          "type": "STRING",
          "description": "A comprehensive markdown report for the human user, detailing the issue, attempts made, and final error messages."
        }
      },
      "required": ["markdown_report"]
    }
  }
]
EOF
