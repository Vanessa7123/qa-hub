import os
import requests
from requests.auth import HTTPBasicAuth
from dotenv import load_dotenv

load_dotenv()

JIRA_URL   = os.getenv("JIRA_URL")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_TOKEN = os.getenv("JIRA_TOKEN")
PROJECT    = os.getenv("JIRA_PROJECT")

auth    = HTTPBasicAuth(JIRA_EMAIL, JIRA_TOKEN)
headers = {"Accept": "application/json"}


def test_auth():
    """Verifica se as credenciais são válidas."""
    url = f"{JIRA_URL}/rest/api/3/myself"
    r = requests.get(url, auth=auth, headers=headers)
    if r.status_code == 200:
        data = r.json()
        print(f"✅ Autenticação OK — logado como: {data['displayName']} ({data['emailAddress']})")
    else:
        print(f"❌ Falha na autenticação: {r.status_code} — {r.text}")
    return r.status_code == 200


def test_project():
    """Verifica se o projeto existe e está acessível."""
    url = f"{JIRA_URL}/rest/api/3/project/{PROJECT}"
    r = requests.get(url, auth=auth, headers=headers)
    if r.status_code == 200:
        data = r.json()
        print(f"✅ Projeto encontrado: {data['name']} ({data['key']})")
    else:
        print(f"❌ Projeto não encontrado: {r.status_code} — {r.text}")
    return r.status_code == 200


def test_issues():
    """Busca as 5 issues mais recentes do projeto."""
    url = f"{JIRA_URL}/rest/api/3/search/jql"
    params = {
        "jql": f"project = {PROJECT} ORDER BY updated DESC",
        "maxResults": 5,
        "fields": "summary,status,assignee,issuetype"
    }
    r = requests.get(url, auth=auth, headers=headers, params=params)
    if r.status_code == 200:
        issues = r.json().get("issues", [])
        print(f"✅ Issues acessíveis — total no projeto: {r.json().get('total', len(issues))}")
        print("   Últimas 5 issues:")
        for issue in issues:
            f = issue["fields"]
            assignee = f["assignee"]["displayName"] if f.get("assignee") else "Sem responsável"
            print(f"   • [{issue['key']}] {f['summary'][:60]} | {f['status']['name']} | {assignee}")
    else:
        print(f"❌ Erro ao buscar issues: {r.status_code} — {r.text}")
    return r.status_code == 200


if __name__ == "__main__":
    print("=== Teste de conexão com o Jira ===\n")
    ok = test_auth()
    if ok:
        test_project()
        test_issues()
    print("\n=== Fim do teste ===")
