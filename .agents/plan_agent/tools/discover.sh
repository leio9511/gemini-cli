#!/bin/bash
set -e

cat <<EOF
[
  {
    "name": "request_plan_review",
    "description": "Submits the generated plan for a final review against the original design document. This is a mandatory final step.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "design_doc_path": {
          "type": "STRING",
          "description": "The file path to the original design document."
        },
        "generated_plan_path": {
          "type": "STRING",
          "description": "The file path to the plan document you just generated."
        }
      },
      "required": ["design_doc_path", "generated_plan_path"]
    }
  }
]
EOF
