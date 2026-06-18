import requests
import json

BASE_URL = "http://localhost:8000"

def test_all_endpoints():
    """Test all GEO endpoints"""
    
    print("=" * 50)
    print("Testing GEO API Endpoints")
    print("=" * 50)
    
    # 1. Test root
    print("\n1. Testing root endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"   ERROR: {e}")
        return False
    
    # 2. Test health
    print("\n2. Testing health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"   ERROR: {e}")
    
    # 3. List all routes
    print("\n3. Available routes:")
    try:
        # Get the OpenAPI schema to see all routes
        response = requests.get(f"{BASE_URL}/openapi.json")
        if response.status_code == 200:
            schema = response.json()
            paths = list(schema.get('paths', {}).keys())
            for path in sorted(paths):
                if '/geo' in path:
                    methods = list(schema['paths'][path].keys())
                    print(f"   {path} -> {methods}")
    except Exception as e:
        print(f"   ERROR getting routes: {e}")
    
    # 4. Test status endpoint with a test job
    print("\n4. Testing status endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/geo/status/test123")
        print(f"   Status: {response.status_code}")
        if response.status_code == 404:
            print("   ✓ Endpoint exists (returns 404 for non-existent job)")
        else:
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"   ERROR: {e}")
    
    # 5. Test upload endpoint (without file)
    print("\n5. Testing upload endpoint...")
    try:
        response = requests.post(f"{BASE_URL}/geo/upload-raw")
        print(f"   Status: {response.status_code}")
        # Should be 422 (validation error) or 400
        if response.status_code in [400, 422]:
            print("   ✓ Endpoint exists (returns validation error without file)")
        else:
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"   ERROR: {e}")
    
    print("\n" + "=" * 50)
    return True

if __name__ == "__main__":
    test_all_endpoints()