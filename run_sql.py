import json
import subprocess
import sys

def run_sql_query(query):
    input_data = {
        "project_id": "mlhxcfxmqgegynzpofsr",
        "query": query
    }
    
    cmd = [
        "manus-mcp-cli", "tool", "call", "execute_sql",
        "--server", "supabase",
        "--input", json.dumps(input_data)
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error executing SQL: {result.stderr}")
        return None
    
    try:
        # البحث عن بداية ونهاية مخرجات الأداة في حال وجود نصوص إضافية
        output = result.stdout
        if "Tool execution result:" in output:
            output = output.split("Tool execution result:")[1].strip()
        
        # في حال كان المخرج مسار ملف
        if output.startswith("/home/ubuntu/"):
            with open(output, 'r') as f:
                output = f.read()
        
        data = json.loads(output)
        return data.get('data', [])
    except Exception as e:
        print(f"Failed to parse output: {e}")
        print(f"Raw output: {result.stdout}")
        return None

def run_sql_file(file_path):
    with open(file_path, 'r') as f:
        sql = f.read()
    return run_sql_query(sql)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        res = run_sql_file(sys.argv[1])
        print(json.dumps(res, indent=2))
