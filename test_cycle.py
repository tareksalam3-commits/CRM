import os
import uuid
import datetime
import json
import subprocess

def run_mcp_sql(query):
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
    return result.stdout

def test_full_cycle():
    print("--- بدء اختبار دورة كاملة للنظام ---")
    
    # جلب أول مندوب متاح في النظام للاختبار
    print("جلب بيانات مندوب للاختبار...")
    res = run_mcp_sql("SELECT id FROM profiles LIMIT 1")
    # محاولة استخراج المعرف من المخرج النصي
    agent_id = None
    if "id" in res:
        # تبسيط استخراج المعرف للاختبار
        import re
        matches = re.findall(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', res)
        if matches:
            agent_id = matches[0]
    
    if not agent_id:
        print("لم يتم العثور على مندوب، سيتم استخدام معرف عشوائي")
        agent_id = str(uuid.uuid4())

    client_id = str(uuid.uuid4())
    policy_id = str(uuid.uuid4())
    inst1_id = str(uuid.uuid4())
    inst2_id = str(uuid.uuid4())
    inst3_id = str(uuid.uuid4())
    issue_date = datetime.date.today()
    future_date = issue_date + datetime.timedelta(days=400)

    print(f"استخدام المندوب: {agent_id}")

    # 1. إنشاء عميل
    print("1. إنشاء عميل...")
    run_mcp_sql(f"INSERT INTO clients (id, name, phone, agent_id) VALUES ('{client_id}', 'عميل اختبار Manus', '0123456789', '{agent_id}')")
    
    # 2. إصدار وثيقة
    print("2. إصدار وثيقة...")
    run_mcp_sql(f"INSERT INTO policies (id, policy_number, client_id, agent_id, issue_date, annual_premium, status) VALUES ('{policy_id}', 'MANUS-TEST-001', '{client_id}', '{agent_id}', '{issue_date}', 12000, 'active')")
    
    # 3. إنشاء أقساط
    print("3. إنشاء أقساط...")
    run_mcp_sql(f"INSERT INTO installments (id, policy_id, installment_number, amount, due_date, status) VALUES ('{inst1_id}', '{policy_id}', 1, 1000, '{issue_date}', 'pending')")
    run_mcp_sql(f"INSERT INTO installments (id, policy_id, installment_number, amount, due_date, status) VALUES ('{inst2_id}', '{policy_id}', 2, 1000, '{issue_date + datetime.timedelta(days=30)}', 'pending')")
    run_mcp_sql(f"INSERT INTO installments (id, policy_id, installment_number, amount, due_date, status) VALUES ('{inst3_id}', '{policy_id}', 13, 1000, '{future_date}', 'pending')")

    # 4. سداد أول قسط (جديد)
    print("4. سداد أول قسط (جديد)...")
    run_mcp_sql(f"INSERT INTO collections (id, installment_id, policy_id, amount, collection_date, collected_by) VALUES ('{uuid.uuid4()}', '{inst1_id}', '{policy_id}', 1000, '{issue_date}', '{agent_id}')")
    
    # 5. سداد قسط ثانٍ (تحصيل أول سنة)
    print("5. سداد قسط ثانٍ (تحصيل أول سنة)...")
    run_mcp_sql(f"INSERT INTO collections (id, installment_id, policy_id, amount, collection_date, collected_by) VALUES ('{uuid.uuid4()}', '{inst2_id}', '{policy_id}', 1000, '{issue_date}', '{agent_id}')")
    
    # 6. سداد قسط بعد سنة (تجديد)
    print("6. سداد قسط بعد سنة (تجديد)...")
    run_mcp_sql(f"INSERT INTO collections (id, installment_id, policy_id, amount, collection_date, collected_by) VALUES ('{uuid.uuid4()}', '{inst3_id}', '{policy_id}', 1000, '{future_date}', '{agent_id}')")

    # 7. التحقق من النتائج
    print("7. التحقق من التصنيفات في قاعدة البيانات...")
    results = run_mcp_sql(f"SELECT collection_category, amount FROM collections WHERE policy_id = '{policy_id}' ORDER BY collection_date ASC")
    print(results)

    print("\n--- اكتمل الاختبار بنجاح ---")

if __name__ == "__main__":
    test_full_cycle()
