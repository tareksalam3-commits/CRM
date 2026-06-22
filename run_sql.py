import json
import subprocess

with open('fix_rls.sql', 'r') as f:
    sql = f.read()

input_data = {
    "project_id": "mlhxcfxmqgegynzpofsr",
    "query": sql
}

cmd = [
    "manus-mcp-cli", "tool", "call", "execute_sql",
    "--server", "supabase",
    "--input", json.dumps(input_data)
]

result = subprocess.run(cmd, capture_output=True, text=True)
print(result.stdout)
print(result.stderr)
