import hashlib
import json
import os

def make_token(username, salt='your-salt', length=12):
    s = username + salt
    full_hash = hashlib.sha256(s.encode('utf-8')).hexdigest()
    return full_hash[:length]  # 取前 length 碼

TOKENS_PATH = os.path.join('src', 'admin-tokens.json')

def load_tokens():
    if not os.path.exists(TOKENS_PATH):
        return []
    with open(TOKENS_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_tokens(tokens):
    with open(TOKENS_PATH, 'w', encoding='utf-8') as f:
        json.dump(tokens, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    username = input("Enter new admin username: ").strip()
    token = make_token(username)
    tokens = load_tokens()
    tokens.append({"username": username, "token": token})
    save_tokens(tokens)
    print(f"Generated token for {username}: {token}")