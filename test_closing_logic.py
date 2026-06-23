import json

def test_data_consistency(data):
    # 1. Check if summary total matches operations sum
    summary_total = data['summary']['achieved']
    ops_total = sum(op['amount'] for op in data['operations'])
    
    # 2. Check if new business and collections match
    nb_sum = sum(op['amount'] for op in data['operations'] if op['type'] == 'جديد')
    coll_sum = sum(op['amount'] for op in data['operations'] if op['type'] == 'تحصيل')
    
    print(f"Summary Total: {summary_total}")
    print(f"Operations Total: {ops_total}")
    print(f"New Business: {nb_sum} (Expected: {data['totals']['newBusiness']})")
    print(f"Collections: {coll_sum} (Expected: {data['totals']['collections']})")
    
    assert summary_total == ops_total, "Total mismatch!"
    assert nb_sum == data['totals']['newBusiness'], "New Business mismatch!"
    assert coll_sum == data['totals']['collections'], "Collections mismatch!"
    print("Test Passed: Data is 100% consistent across all sections.")

# Mock data based on the new structure
mock_data = {
    'summary': {
        'achieved': 15000,
        'newBusiness': 10000,
        'collections': 5000
    },
    'operations': [
        {'amount': 5000, 'type': 'جديد'},
        {'amount': 5000, 'type': 'جديد'},
        {'amount': 2500, 'type': 'تحصيل'},
        {'amount': 2500, 'type': 'تحصيل'}
    ],
    'totals': {
        'newBusiness': 10000,
        'collections': 5000
    }
}

if __name__ == "__main__":
    test_data_consistency(mock_data)
