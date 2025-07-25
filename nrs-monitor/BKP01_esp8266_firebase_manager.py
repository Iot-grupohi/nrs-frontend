import pyrebase
import time
import json
import os
import requests
import socket
import threading
import subprocess
from datetime import datetime
import random
import concurrent.futures
import platform
import logging

# Garante que o logging só use o arquivo .log
for handler in logging.root.handlers[:]:
    logging.root.removeHandler(handler)
logging.basicConfig(
    filename='esp8266_firebase_manager.log',
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)

# Estrutura completa de loja modelo para criação automática
MODELO_LOJA_COMPLETO = {
  "ar_condicionado": {
    "18": False,
    "22": False,
    "OFF": False
  },
  "coordenadas": {
    "lat": 0,
    "lon": 0
  },
  "dosadora_01": {
    "432": {
      "ajuste_tempo_floral": 0,
      "ajuste_tempo_sabao": 0,
      "ajuste_tempo_sport": 0,
      "amaciante": 0,
      "bomba": 0,
      "consulta_tempo": False,
      "dosagem": 0,
      "dosagem_endpoint": "am01-1",
      "softener_endpoint": "softener1",
      "tempo_atual_floral": "0",
      "tempo_atual_sabao": "0",
      "tempo_atual_sport": "0"
    },
    "543": {
      "ajuste_tempo_floral": 0,
      "ajuste_tempo_sabao": 0,
      "ajuste_tempo_sport": 0,
      "amaciante": 0,
      "bomba": 0,
      "consulta_tempo": False,
      "dosagem": 0,
      "dosagem_endpoint": "am01-1",
      "softener_endpoint": "softener1",
      "tempo_atual_floral": "0",
      "tempo_atual_sabao": "0",
      "tempo_atual_sport": "0"
    },
    "654": {
      "ajuste_tempo_floral": 0,
      "ajuste_tempo_sabao": 0,
      "ajuste_tempo_sport": 0,
      "amaciante": 0,
      "bomba": 0,
      "consulta_tempo": False,
      "dosagem": 0,
      "dosagem_endpoint": "am01-1",
      "softener_endpoint": "softener1",
      "tempo_atual_floral": "0",
      "tempo_atual_sabao": "0",
      "tempo_atual_sport": "0"
    }
  },
  "heartbeat": 0,
  "lavadoras": {
    "432": False,
    "543": False,
    "654": False
  },
  "pc_status": {
    "timestamp": "0"
  },
  "secadoras": {
    "765_15": False,
    "765_30": False,
    "765_45": False,
    "876_15": False,
    "876_30": False,
    "876_45": False,
    "987_15": False,
    "987_30": False,
    "987_45": False
  },
  "status": {
    "ar_condicionado": "offline",
    "dosadoras": {
      "432": "offline",
      "543": "offline",
      "654": "offline"
    },
    "lavadoras": {
      "432": "offline",
      "543": "offline",
      "654": "offline"
    },
    "secadoras": {
      "765": "offline",
      "876": "offline",
      "987": "offline"
    }
  },
  "status_motherboard": "ON",
  "config": {
    "intervalo_global": 120,
    "last_update": "0"
  }
}

# Configuração da API
API_ENABLED = False  # API desabilitada por padrão para evitar sobrecarga no servidor
API_ENDPOINT = "https://api.example.com/machines/status"  # Endpoint fictício
API_TOKEN = "your-api-token"  # Token fictício
API_CHECK_INTERVAL = 300  # 5 minutos por padrão

# Configurações do Firebase (mesmas do ESP8266)
FIREBASE_CONFIG = {
    "apiKey": "AIzaSyC2wdGyqHKntFJKgjbu8gx2L0Fi740Ws7w",
    "authDomain": "hipag-02.firebaseapp.com",
    "databaseURL": "https://hipag-02-default-rtdb.firebaseio.com",
    "projectId": "hipag-02",
    "storageBucket": "hipag-02.firebasestorage.app",
    "messagingSenderId": "1096728529428",
    "appId": "1:1096728529428:web:6f8be1d07a713a223d3501"
}

# Configurações dos dispositivos (correspondendo aos arrays do ESP8266)
DOSADORAS = [
    {"id": "432", "ip": "10.1.40.151", "endpoint": "status", "type": "dosadoras"},
    {"id": "543", "ip": "10.1.40.152", "endpoint": "status", "type": "dosadoras"},
    {"id": "654", "ip": "10.1.40.153", "endpoint": "status", "type": "dosadoras"}
]

LAVADORAS = [
    {"id": "432", "ip": "10.1.40.101", "endpoint": "lb",
        "type": "lavadoras", "isAC": False, "numGets": 1},
    {"id": "543", "ip": "10.1.40.102", "endpoint": "lb",
        "type": "lavadoras", "isAC": False, "numGets": 1},
    {"id": "654", "ip": "10.1.40.103", "endpoint": "lb",
        "type": "lavadoras", "isAC": False, "numGets": 1}
]

SECADORAS = [
    {"id": "765", "ip": "10.1.40.104", "endpoint": "lb",
        "type": "secadoras", "isAC": False, "numGets": 3},  # 45 minutos
    {"id": "876", "ip": "10.1.40.105", "endpoint": "lb",
        "type": "secadoras", "isAC": False, "numGets": 3},  # 45 minutos
    {"id": "987", "ip": "10.1.40.106", "endpoint": "lb",
        "type": "secadoras", "isAC": False, "numGets": 3}   # 45 minutos
]

AR_CONDICIONADO = [
    {"temp": "18", "endpoint": "airon1"},
    {"temp": "22", "endpoint": "airon2"},
    {"temp": "OFF", "endpoint": "airon3"}
]

# Constantes de configuração
HTTP_TIMEOUT = 3.0         # Timeout para requisições HTTP (segundos) - AUMENTADO
HTTP_TIMEOUT_LAVADORAS = 4.0  # Timeout especial para lavadoras (segundos) - AUMENTADO
DELAY_BETWEEN_GETS = 0.5   # Intervalo entre GETs sequenciais (segundos)
HEARTBEAT_INTERVAL = 180   # Intervalo padrão de heartbeat (segundos)
# Intervalo padrão para verificação de rede (segundos)
NETWORK_CHECK_INTERVAL = 60

# Variáveis globais
cache = {}
store_id = None
firebase_db = None
is_running = False
button_state = False       # Estado do botão (ON/OFF)
heartbeat_interval = HEARTBEAT_INTERVAL  # Pode ser alterado via Firebase

# Dicionário para armazenar o timestamp do último reset por dispositivo
last_reset_time = {}

# Caminhos no Firebase
base_path = None
lavadoras_path = None
secadoras_path = None
ar_path = None
status_path = None
dosadora_path = None
pc_status_path = None
reset_path = None
button_path = None
config_path = None

# Contador de falhas consecutivas por dispositivo
falhas_consecutivas = {}

# Dicionário para controlar os timers de reset
reset_timers = {}

def reset_secadora_status(id_secadora_completo):
    """Reseta o status da secadora para False após o timer"""
    print(f"Timer expirado: Resetando status da secadora {id_secadora_completo} para False")
    firebase_db.child(secadoras_path).child(id_secadora_completo).set(False)
    if id_secadora_completo in reset_timers:
        del reset_timers[id_secadora_completo]

def coletar_store_id():
    """Coleta o STORE_ID das variáveis de ambiente ou do registro do Windows"""
    global store_id

    # Tentar obter do ambiente Python
    env_store_id = os.environ.get("STORE_ID")
    if env_store_id:
        store_id = env_store_id
        return store_id

    # Tentar via PowerShell
    try:
        cmd = "powershell -Command \"[Environment]::GetEnvironmentVariable('STORE_ID', 'User')\""
        output = subprocess.check_output(cmd, shell=True, text=True).strip()
        if output:
            store_id = output
            return store_id
    except Exception as e:
        print(f"Erro ao consultar via PowerShell: {e}")

    # Tentar via Registro do Windows
    try:
        import win32api
        import win32con
        key = win32api.RegOpenKeyEx(
            win32con.HKEY_CURRENT_USER, r"Environment", 0, win32con.KEY_READ)
        try:
            value, _ = win32api.RegQueryValueEx(key, "STORE_ID")
            store_id = value
            return store_id
        except Exception as e:
            print(f"Erro ao ler registro: {e}")
        finally:
            win32api.RegCloseKey(key)
    except Exception as e:
        print(f"Erro ao acessar registro do Windows: {e}")

    # Se não encontrado, usar valor padrão (NÃO pedir input)
    store_id = "SP01"
    print(f"Usando código de loja padrão: {store_id}")
    return store_id


def conectar_firebase():
    """Estabelece conexão com o Firebase Realtime Database"""
    global firebase_db

    try:
        print("Conectando ao Firebase...")
        firebase = pyrebase.initialize_app(FIREBASE_CONFIG)
        firebase_db = firebase.database()
        print("Conexão com Firebase estabelecida com sucesso!")
        return True
    except Exception as e:
        print(f"Erro ao conectar com Firebase: {e}")
        return False


def atualizar_caminhos_firebase():
    """Atualiza os caminhos do Firebase com base no código da loja"""
    global base_path, lavadoras_path, secadoras_path, ar_path, status_path
    global dosadora_path, pc_status_path, reset_path, button_path, config_path
    global status_machine_path, verificacao_manual_path

    if store_id:
        base_path = f"/{store_id}"
        lavadoras_path = f"{base_path}/lavadoras"
        secadoras_path = f"{base_path}/secadoras"
        ar_path = f"{base_path}/ar_condicionado"
        status_path = f"{base_path}/status"
        dosadora_path = f"{base_path}/dosadora_01"
        pc_status_path = f"{base_path}/pc_status"
        reset_path = f"{base_path}/reset"
        button_path = f"{base_path}/status_motherboard"
        config_path = f"{base_path}/config"
        status_machine_path = f"{base_path}/status_machines"

        # Cria os caminhos para controle de verificação de rede se não existirem
        check_network_path = f"{base_path}/check_network"

        if firebase_db:
            try:
                if firebase_db.child(check_network_path).get().val() is None:
                    firebase_db.child(check_network_path).set(False)

                # Inicializa o nó de configuração se não existir
                if firebase_db.child(config_path).get().val() is None:
                    config_inicial = {
                        "intervalo_global": 120,
                        "last_update": str(int(time.time() * 1000))
                    }
                    firebase_db.child(config_path).set(config_inicial)

                # Também mantém a compatibilidade com os nós antigos
                if firebase_db.child(f"{base_path}/intervalo_global").get().val() is None:
                    firebase_db.child(
                        f"{base_path}/intervalo_global").set(120)

            except Exception as e:
                print(f"Erro ao inicializar caminhos do Firebase: {e}")

        print("Caminhos do Firebase atualizados:")
        print(f"- Base: {base_path}")
        print(f"- Lavadoras: {lavadoras_path}")
        print(f"- Secadoras: {secadoras_path}")
        print(f"- Ar Condicionado: {ar_path}")
        print(f"- Status: {status_path}")
        print(f"- Dosadora: {dosadora_path}")
        print(f"- PC Status: {pc_status_path}")
        print(f"- Reset: {reset_path}")
        print(f"- Status Totem: {button_path}")
        print(f"- Configuração: {config_path}")
        print(f"- Verificação Rede: {check_network_path}")
        return True
    else:
        print("ERRO: Código da loja não definido!")
        return False


def tentar_comunicacao_real(ip, endpoint, num_gets=1, retornar_resposta=False, device_type=None):
    """Tenta fazer uma comunicação real com o dispositivo, se possível."""
    # Remove barras iniciais do endpoint para evitar URLs com barras duplas
    endpoint = endpoint.lstrip('/')
    url = f"http://{ip}/{endpoint}"

    # Detecta se é uma verificação de status
    is_status_check = endpoint.lower() == "status"

    # Reduzir logs para verificações de status
    if not is_status_check:
        print(f"Tentando comunicação REAL com: {url}")

    # Determina o timeout apropriado com base no tipo de dispositivo
    timeout = HTTP_TIMEOUT
    if device_type == "lavadoras":
        # Timeout maior para lavadoras que tendem a demorar mais para responder
        timeout = HTTP_TIMEOUT_LAVADORAS
        if not is_status_check:
            print(f"Usando timeout estendido ({timeout}s) para lavadora")

    # Tentar usar requests para comunicação real
    try:
        import requests

        sucesso = True
        resposta_texto = None

        for i in range(num_gets):
            try:
                # Define o timeout apropriado para o tipo de dispositivo
                inicio = time.time()
                response = requests.get(url, timeout=timeout)
                tempo = round((time.time() - inicio) * 1000)

                codigo = response.status_code
                texto = response.text[:50] + \
                    "..." if len(response.text) > 50 else response.text
                resposta_texto = response.text  # Guarda a resposta completa

                if 200 <= codigo < 300:
                    # Reduzir logs de status
                    if not is_status_check:
                        print(
                            f"GET REAL {i+1}/{num_gets} - Sucesso: HTTP {codigo} ({tempo}ms)")
                        print(f"Resposta: {texto}")
                    if device_type == "lavadoras":
                        print(f"✔️ Lavadora {device_id} liberada com sucesso! Status HTTP: {codigo}")
                        print(f"Resposta completa da lavadora: {resposta_texto}")
                else:
                    # Minimizar logs para falhas de status
                    if not is_status_check:
                        print(
                            f"GET REAL {i+1}/{num_gets} - Erro: HTTP {codigo} ({tempo}ms)")
                    sucesso = False
            except requests.exceptions.Timeout:
                # Minimizar logs para timeout
                if not is_status_check:
                    print(
                        f"GET REAL {i+1}/{num_gets} - Falha: Timeout após {timeout}s")
                sucesso = False
            except requests.exceptions.ConnectionError:
                # Minimizar logs para erros de conexão
                if not is_status_check:
                    print(
                        f"GET REAL {i+1}/{num_gets} - Falha: Dispositivo não encontrado ou recusou conexão")
                sucesso = False
            except Exception as e:
                # Minimizar logs para outros erros
                if not is_status_check:
                    print(
                        f"GET REAL {i+1}/{num_gets} - Erro inesperado: {str(e)}")
                sucesso = False

            # Aumentar o delay entre GETs para dar tempo ao ESP processar a requisição anterior
            if i < num_gets - 1 and sucesso:
                print(
                    f"Aguardando {DELAY_BETWEEN_GETS}s antes da próxima requisição para evitar sobrecarga no ESP...")
                # Delay maior entre GETs para não sobrecarregar o ESP
                time.sleep(DELAY_BETWEEN_GETS)

        # Exibe um resumo da comunicação real apenas para requisições não-status
        if not is_status_check:
            if sucesso:
                print(f"🌐 COMUNICAÇÃO REAL BEM-SUCEDIDA com {ip}")
            else:
                print(f"🌐 FALHA NA COMUNICAÇÃO REAL com {ip}")

        # Se for solicitado para retornar a resposta
        if retornar_resposta and sucesso:
            return resposta_texto
        else:
            return sucesso

    except ImportError:
        if not is_status_check:
            print("Módulo 'requests' não encontrado - Usando apenas simulação")
        return None
    except Exception as e:
        if not is_status_check:
            print(f"Erro ao tentar comunicação real: {e}")
        return None


def consultar_tempo_dosadora(ip, endpoint, tipo):
    """Consulta o tempo real de um parâmetro da dosadora"""
    # Reduzir verbosidade - print(f"Consultando tempo de {tipo} para dosadora no endpoint: {endpoint}")

    # Tenta fazer uma comunicação real para obter o tempo
    resposta = tentar_comunicacao_real(ip, endpoint, 1, retornar_resposta=True)

    # Se obtiver uma resposta real
    if resposta is not None and not isinstance(resposta, bool):
        try:
            # Tenta converter a resposta para um número (suportando números com ponto decimal)
            # Primeiro remove espaços em branco e depois converte para float
            resposta_limpa = resposta.strip()
            tempo_valor = float(resposta_limpa)

            # Se o valor for maior que 1000, assume que é em milissegundos
            # Se for menor que 1000, assume que é em segundos
            if tempo_valor > 1000:
                # Converte de ms para segundos
                tempo_segundos = int(tempo_valor) // 1000
            else:
                tempo_segundos = int(tempo_valor)  # Já está em segundos

            # Reduzir verbosidade - print(f"✅ Tempo real obtido para {tipo}: {tempo_segundos} segundos")
            return tempo_segundos
        except ValueError:
            # Reduzir verbosidade - print(f"⚠️ Resposta recebida, mas não é um número válido: '{resposta}'")
            pass
        except Exception as e:
            # Reduzir verbosidade - print(f"⚠️ Erro ao processar resposta: {str(e)}")
            pass

    # Se não conseguir obter o tempo real, usa um valor padrão
    tempo_padrao = 5  # 5 segundos como valor padrão fixo
    # Reduzir verbosidade - print(f"⚠️ Usando tempo padrão para {tipo}: {tempo_padrao} segundos")
    return tempo_padrao


def enviar_http_request(ip, endpoint, num_gets=1, device_type=None, device_id=None, tipo=None):
    """Envia requisições HTTP para os dispositivos - versão otimizada"""
    import requests
    endpoint = endpoint.lstrip('/')
    url = f"http://{ip}/{endpoint}"
    timeout = HTTP_TIMEOUT
    if device_type == "lavadoras":
        timeout = HTTP_TIMEOUT_LAVADORAS
    elif device_type == "secadoras":
        timeout = 6.0  # Aumenta timeout para secadoras
    elif device_type == "ar_condicionado":
        timeout = HTTP_TIMEOUT

    headers = {
        "Connection": "close",
        "Cache-Control": "no-cache"
    }

    try:
        success = True
        start_time = time.time()
        for i in range(num_gets):
            try:
                print(f"\n>>> Processando {device_type} {device_id} <<<")
                print(f"- Endpoint chamado: {endpoint}")
                print(f"- URL completa: {url}")

                # Log especial para lavadora 654
                if device_type == "lavadoras" and device_id == "654":
                    print(f"DEBUG 654 - Tentando acessar: {url}")
                    print(f"DEBUG 654 - Timeout configurado: {timeout}s")

                response = requests.get(url, timeout=timeout, headers=headers)
                elapsed_ms = round((time.time() - start_time) * 1000)

                # Análise detalhada da resposta
                resposta_texto = response.text.strip()
                print(f"- Status HTTP: {response.status_code} ({elapsed_ms}ms)")
                print(f"- Resposta bruta: {resposta_texto}")

                # Log especial para lavadora 654
                if device_type == "lavadoras" and device_id == "654":
                    print(f"DEBUG 654 - Headers da resposta: {dict(response.headers)}")
                    print(f"DEBUG 654 - Encoding: {response.encoding}")

                # Considera sucesso se:
                # 1. Status HTTP é 200-299 E
                # 2. A resposta contém indicação de sucesso
                response_success = False
                if 200 <= response.status_code < 300:
                    if device_type == "lavadoras":
                        # Considera sucesso se a resposta contém qualquer um destes textos
                        success_indicators = ["GPIO is now high", "high", "OK", "Success", "<!DOCTYPE"]
                        response_success = any(indicator.lower() in resposta_texto.lower() for indicator in success_indicators)

                        if response_success:
                            print(f"✅ Lavadora {device_id} liberada com sucesso!")
                            print(f"🟢 Status HTTP: {response.status_code}")
                            print(f"⏱️ Tempo de resposta: {elapsed_ms}ms")
                        else:
                            print(f"⚠️ Status HTTP ok mas resposta não indica sucesso")
                            # Log especial para lavadora 654
                            if device_id == "654":
                                print(f"DEBUG 654 - Resposta não contém nenhum dos indicadores de sucesso:")
                                for indicator in success_indicators:
                                    print(f"  - Procurando '{indicator}': {'✓' if indicator.lower() in resposta_texto.lower() else '✗'}")
                            success = False
                    else:
                        # Para outros dispositivos, considera sucesso se status HTTP ok
                        response_success = True
                        print(f"✅ Comando para {device_type} executado com sucesso")
                else:
                    print(f"❌ Erro na requisição: HTTP {response.status_code}")
                    if device_type == "lavadoras":
                        print(f"❌ Erro na liberação da lavadora {device_id}")
                    elif device_type == "dosadoras":
                        print(f"❌ Erro no comando da dosadora {device_id}")
                    success = False

                # Se não teve sucesso na resposta
                if not response_success:
                    success = False

            except requests.exceptions.Timeout:
                # Melhorando a mensagem de timeout para todas as lavadoras
                if device_type == "lavadoras":
                    print(f"⏱️ Timeout após {timeout}s (normal para lavadoras)")
                    print(f"ℹ️ As lavadoras frequentemente processam comandos mesmo sem responder")
                elif device_type == "secadoras":
                    print(f"⏱️ Timeout após {timeout}s (normal para secadoras)")
                    print(f"ℹ️ As secadoras frequentemente processam comandos mesmo sem responder")
                    print(f"ℹ️ Verifique se a secadora foi ativada apesar do timeout")
                else:
                    print(f"❌ Timeout após {timeout}s")

                # Log especial para lavadora 654
                if device_type == "lavadoras" and device_id == "654":
                    print(f"DEBUG 654 - Timeout ao tentar acessar {url}")
                    print(f"INFO: Timeouts são comuns em lavadoras devido ao processamento local.")
                    print(f"INFO: Em muitos casos, a lavadora processa o comando mas demora para responder.")
                    print(f"INFO: Verifique se a porta da lavadora foi desbloqueada apesar do timeout.")
                # Log especial para secadora 765    
                elif device_type == "secadoras" and device_id == "765":
                    print(f"DEBUG 765 - Timeout ao tentar acessar {url}")
                    print(f"INFO: Timeouts são comuns em secadoras devido ao processamento local.")
                    print(f"INFO: Em muitos casos, a secadora ativa mesmo sem responder à requisição HTTP.")
                    print(f"INFO: Verifique se a secadora foi ativada apesar do timeout.")
                success = False
            except requests.exceptions.ConnectionError:
                print(f"❌ Erro de conexão: dispositivo não encontrado ou recusou conexão")
                # Log especial para lavadora 654
                if device_type == "lavadoras" and device_id == "654":
                    print(f"DEBUG 654 - Erro de conexão ao tentar acessar {url}")
                # Log especial para secadora 765
                elif device_type == "secadoras" and device_id == "765":
                    print(f"DEBUG 765 - Erro de conexão ao tentar acessar {url}")
                    print(f"INFO: Verifique se a secadora está conectada à rede.")
                    print(f"INFO: Tente reiniciar o dispositivo se persistir o problema.")
                success = False
                break
            except Exception as e:
                print(f"❌ Erro inesperado: {str(e)}")
                # Log especial para lavadora 654
                if device_type == "lavadoras" and device_id == "654":
                    print(f"DEBUG 654 - Erro inesperado: {str(e)}")
                success = False

            # Adiciona delay entre requisições múltiplas
            if i < num_gets - 1:
                print(f"Aguardando {DELAY_BETWEEN_GETS}s antes da próxima requisição...")
                time.sleep(DELAY_BETWEEN_GETS)

        # Controle de falhas consecutivas
        global falhas_consecutivas
        chave = f"{tipo or device_type}:{device_id or ip}"
        if not success:
            # Se falhou o HTTP, faz um ping para checar se está online
            print(f"Falha no HTTP, testando ping para {ip}...")
            online = ping_dispositivo(ip)
            if online:
                print(f"Dispositivo {ip} respondeu ao ping. Mantendo status ONLINE.")
                # NUNCA ATUALIZAMOS O STATUS DE LAVADORAS APÓS TIMEOUT/FALHA
                if device_type != "lavadoras":
                    # CORREÇÃO: Forçamos o status como online já que o ping respondeu
                    atualizar_estado_dispositivo(device_id or ip, tipo or device_type, True)
                else:
                    print(f"Não atualizando status da lavadora {device_id} no Firebase após timeout")
                # Mantém o retorno como false para indicar que o comando falhou,
                # mas o dispositivo está online
                return False
            else:
                print(f"Dispositivo {ip} não respondeu ao ping. Marcando como OFFLINE.")
                # NUNCA ATUALIZAMOS O STATUS DE LAVADORAS APÓS TIMEOUT/FALHA
                if device_type != "lavadoras":
                    atualizar_estado_dispositivo(device_id or ip, tipo or device_type, False)
                else:
                    print(f"Não atualizando status da lavadora {device_id} no Firebase após timeout")
                print(f"❌ Falha na comunicação com {ip}")
                return False
        else:
            # NUNCA ATUALIZAMOS O STATUS DE LAVADORAS APÓS TIMEOUT/FALHA
            if device_type != "lavadoras":
                # Sempre atualiza como online se o comando foi bem-sucedido
                atualizar_estado_dispositivo(device_id or ip, tipo or device_type, True)
            return True
    except Exception as e:
        print(f"Erro ao tentar comunicação: {e}")
        # Não alterar o status em caso de erro na função
        # Apenas retorna falha
        return False


def atualizar_estado_dispositivo(device_id, tipo, online):
    """Atualiza o status de um dispositivo no Firebase"""
    global last_reset_time
    if not firebase_db:
        return False

    status_valor = "online" if online else "offline"
    try:
        # Ignora atualização para offline se ocorreu reset recente
        if not online:
            agora_ms = int(time.time() * 1000)
            ultimo_reset = last_reset_time.get(device_id)
            if ultimo_reset and (agora_ms - ultimo_reset) < 5000:
                print(f"Ignorando atualização para offline de {tipo} {device_id} devido a reset recente")
                return True

        if tipo == "ar_condicionado":
            caminho = f"{status_path}/ar_condicionado"
            nome_dispositivo = "Ar Condicionado"
        elif tipo == "secadoras":
            # Extrai apenas os 3 primeiros caracteres do ID
            base_id = device_id[:3]
            caminho = f"{status_path}/secadoras/{base_id}"
            nome_dispositivo = f"Secadora {base_id}"
        elif tipo == "lavadoras":
            caminho = f"{status_path}/lavadoras/{device_id}"
            nome_dispositivo = f"Lavadora {device_id}"

            # Tratamento especial para lavadoras - verificar se houve chamada recente de atualização
            # de PC status que poderia estar causando uma atualização indevida
            ultimo_timestamp_ms = int(time.time() * 1000)
            try:
                ultimo_pc_timestamp = firebase_db.child(
                    f"{pc_status_path}/timestamp").get().val()
                if ultimo_pc_timestamp:
                    ultimo_pc_timestamp = int(ultimo_pc_timestamp)
                    # Se houve atualização de PC status nos últimos 2 segundos, manter status atual
                    if (ultimo_timestamp_ms - ultimo_pc_timestamp) < 2000:
                        # Se estamos tentando marcar como offline sem verificação explícita,
                        # manter o status atual
                        if not online:
                            status_atual = firebase_db.child(
                                caminho).get().val()
                            if status_atual == "online":
                                # Manter como online
                                return True
            except:
                pass
        elif tipo == "dosadoras":
            caminho = f"{status_path}/dosadoras/{device_id}"
            nome_dispositivo = f"Dosadora {device_id}"

            # Tratamento especial para dosadoras - verificar se houve chamada recente de atualização
            # de PC status que poderia estar causando uma atualização indevida
            ultimo_timestamp_ms = int(time.time() * 1000)
            try:
                ultimo_pc_timestamp = firebase_db.child(
                    f"{pc_status_path}/timestamp").get().val()
                if ultimo_pc_timestamp:
                    ultimo_pc_timestamp = int(ultimo_pc_timestamp)
                    # Se houve atualização de PC status nos últimos 2 segundos, manter status atual
                    if (ultimo_timestamp_ms - ultimo_pc_timestamp) < 2000:
                        # Se estamos tentando marcar como offline sem verificação explícita,
                        # manter o status atual
                        if not online:
                            status_atual = firebase_db.child(
                                caminho).get().val()
                            if status_atual == "online":
                                # Manter como online
                                return True
            except:
                pass
        else:
            return False

        # Obtém o status anterior para comparação
        status_anterior = firebase_db.child(caminho).get().val()

        # Atualiza o status no Firebase
        firebase_db.child(caminho).set(status_valor)

        # Feedback de alteração de status - apenas mudanças significativas
        # Completamente desativado para reduzir logs
        # if status_anterior != status_valor:
        #     if online:
        #         print(f"🟢 {nome_dispositivo} agora está ONLINE")
        #     else:
        #         print(f"🔴 {nome_dispositivo} agora está OFFLINE")

        return True
    except Exception as e:
        print(f"Erro ao atualizar status do dispositivo: {e}")
        return False


def atualizar_heartbeat():
    """Atualiza o heartbeat no Firebase - versão ultra otimizada"""
    try:
        # Obtém timestamp atual em milissegundos
        timestamp_ms = int(time.time() * 1000)
        
        # Usa update() para fazer todas as atualizações em uma única operação
        updates = {
            f"{base_path}/heartbeat": timestamp_ms,
            f"{pc_status_path}/timestamp": str(timestamp_ms)
        }
        
        # Executa todas as atualizações em uma única operação
        firebase_db.update(updates)
        return True
    except Exception as e:
        print(f"Erro ao atualizar heartbeat: {e}")
        return False


def setup_button_listener():
    """Configura listener para o status do botão (motherboard)"""
    print("Configurando listener para o status do botão (motherboard)...")

    def button_stream_handler(message):
        if message["event"] == "put" and message["path"] == "/":
            data = message["data"]
            if data:
                # Exibe cabeçalho do evento
                # exibir_evento("TOTEM", "Botão Físico", f"ALTERADO PARA {data}")

                # Atualiza o PC status sem afetar outros dispositivos
                # Usa update() em vez de set() para atualizar apenas este nó específico
                try:
                    # Atualiza somente o PC status e seu timestamp
                    timestamp_ms = int(time.time() * 1000)

                    # Atualiza diretamente sem interferir nos outros listeners
                    firebase_db.child(pc_status_path).set(data)
                    firebase_db.child(
                        f"{pc_status_path}/timestamp").set(str(timestamp_ms))

                    print(
                        f"- PC status atualizado para: {data} (timestamp: {timestamp_ms})")

                    # Força atualização do status das dosadoras para garantir que permaneçam corretas
                    for dosadora in DOSADORAS:
                        # Verifica status atual
                        status_path_dosadora = f"{status_path}/dosadoras/{dosadora['id']}"
                        status_atual = firebase_db.child(
                            status_path_dosadora).get().val()

                        # Se estava online, força manter online
                        if status_atual == "online":
                            firebase_db.child(
                                status_path_dosadora).set("online")
                except Exception as e:
                    print(f"Erro ao atualizar PC status: {e}")

    try:
        button_stream = firebase_db.child(
            button_path).stream(button_stream_handler)
        print("Listener para status do botão configurado com sucesso!")
        return button_stream
    except Exception as e:
        print(f"Erro ao configurar listener para o botão: {e}")
        return None


def verificar_dispositivo_na_rede(dispositivo):
    """Verifica se um dispositivo está respondendo na rede via ping"""
    ip = dispositivo["ip"]
    tipo = dispositivo.get("type", "desconhecido")
    id_dispositivo = dispositivo.get("id", "desconhecido")

    # Faz 3 tentativas de ping com timeout de 1 segundo
    online = ping_dispositivo(ip, tentativas=3, timeout=1000)

    # Atualiza o status no Firebase
    if tipo in ["lavadoras", "secadoras", "dosadoras", "ar_condicionado"]:
        atualizar_estado_dispositivo(id_dispositivo, tipo, online)

    status_str = "ONLINE" if online else "OFFLINE"
    print(f"  Dispositivo {tipo} {id_dispositivo} ({ip}): {status_str}")

    return online


def monitorar_rede_periodicamente():
    global is_running
    print("[REDE] Iniciando monitoramento periódico de rede...")
    while is_running:
        try:
            try:
                config = firebase_db.child(config_path).get().val()
                intervalo = int(config.get("intervalo_global", 120))
                if intervalo < 10:
                    intervalo = 120
            except:
                intervalo = 120
            print(f"[REDE] Próxima verificação em {intervalo}s...")
            updates = {}
            # Verifica e reseta secadoras para false, se necessário
            try:
                print("[REDE] Verificando e resetando estado das secadoras...")
                estado_secadoras = firebase_db.child(secadoras_path).get().val()
                if estado_secadoras:
                    for id_secadora_completo, estado_atual in estado_secadoras.items():
                        if (estado_atual is not None and estado_atual is not False) and id_secadora_completo not in reset_timers:
                            print(f"  [REDE] Resetando secadora {id_secadora_completo}: {estado_atual} -> false")
                            updates[f"{secadoras_path}/{id_secadora_completo}"] = False
                        elif id_secadora_completo in reset_timers:
                            print(f"  [REDE] NÃO resetando secadora {id_secadora_completo} (timer ativo)")
            except Exception as e:
                print(f"[ERRO][REDE] Erro ao verificar/resetar estado das secadoras: {e}")
            # Verifica e reseta lavadoras para false, se necessário
            try:
                print("[REDE] Verificando e resetando estado das lavadoras...")
                estado_lavadoras = firebase_db.child(lavadoras_path).get().val()
                if estado_lavadoras:
                    for id_lavadora, estado_atual in estado_lavadoras.items():
                        if (estado_atual is not None and estado_atual is not False) and id_lavadora not in reset_timers:
                            print(f"  [REDE] Resetando lavadora {id_lavadora}: {estado_atual} -> false")
                            updates[f"{lavadoras_path}/{id_lavadora}"] = False
                        elif id_lavadora in reset_timers:
                            print(f"  [REDE] NÃO resetando lavadora {id_lavadora} (timer ativo)")
            except Exception as e:
                print(f"[ERRO][REDE] Erro ao verificar/resetar estado das lavadoras: {e}")
            dispositivos = []
            dispositivos.extend(LAVADORAS)
            dispositivos.extend(SECADORAS)
            dispositivos.extend(DOSADORAS)
            dispositivos.append({"id": "AC", "ip": "10.1.40.110", "type": "ar_condicionado"})
            ip_to_devices = {}
            for dispositivo in dispositivos:
                ip = dispositivo["ip"]
                if ip not in ip_to_devices:
                    ip_to_devices[ip] = []
                ip_to_devices[ip].append(dispositivo)
            print("[REDE] Status dos dispositivos:")
            for ip, devices in ip_to_devices.items():
                online = ping_dispositivo(ip)
                vistos = set()
                for dispositivo in devices:
                    tipo = dispositivo.get("type")
                    id_dispositivo = dispositivo["id"]
                    if not tipo and dispositivo in DOSADORAS:
                        tipo = "dosadoras"
                    elif not tipo:
                        tipo = "desconhecido"
                    chave = (tipo, id_dispositivo)
                    if chave not in vistos:
                        vistos.add(chave)
                        tipo_str = tipo.capitalize()[:-1] if tipo and tipo.endswith('s') else tipo.capitalize()
                        status_str = "ONLINE" if online else "OFFLINE"
                        print(f"  {tipo_str} {id_dispositivo} ({ip}): {status_str}")
                    status_valor = "online" if online else "offline"
                    if tipo == "ar_condicionado":
                        updates[f"{status_path}/ar_condicionado"] = status_valor
                    elif tipo == "secadoras":
                        base_id = id_dispositivo[:3]
                        updates[f"{status_path}/secadoras/{base_id}"] = status_valor
                    elif tipo == "lavadoras":
                        updates[f"{status_path}/lavadoras/{id_dispositivo}"] = status_valor
                    elif tipo == "dosadoras":
                        updates[f"{status_path}/dosadoras/{id_dispositivo}"] = status_valor
            if updates:
                firebase_db.update(updates)
                print(f"[REDE] Status de {len(updates)} dispositivos atualizados.")
            time.sleep(intervalo)
        except Exception as e:
            print(f"[ERRO][REDE] {e}")
            time.sleep(60)


def loop_principal():
    """Loop principal do programa - agora com monitoramento de rede ativo"""
    global is_running
    check_interval = 0.5
    print("Iniciando loop principal - Modo com monitoramento de rede...")
    is_running = True

    # Inicia thread de monitoramento de rede
    rede_thread = threading.Thread(
        target=monitorar_rede_periodicamente, name="NetworkMonitorThread")
    rede_thread.daemon = True
    rede_thread.start()

    try:
        while is_running:
            time.sleep(check_interval)
    except KeyboardInterrupt:
        print("\nDetectado Ctrl+C. Encerrando graciosamente...")
        is_running = False
    except Exception as e:
        print(f"Erro crítico no loop principal: {e}")
        print("Tentando continuar...")
        time.sleep(5)


def inicializar_sistema():
    """Inicializa o sistema de forma otimizada"""
    global firebase_db, store_id, device_streams, button_stream, all_streams
    print("\n=== INICIANDO SISTEMA ===")
    all_streams = []
    try:
        store_id = coletar_store_id()
        if not store_id:
            print("ERRO: Não foi possível obter o STORE_ID!")
            return False
        print(f"✓ STORE_ID configurado: {store_id}")

        if not atualizar_caminhos_firebase():
            print("ERRO: Falha ao configurar caminhos do Firebase!")
            return False
        print("✓ Caminhos do Firebase atualizados")

        if not conectar_firebase():
            print("ERRO: Falha ao conectar com Firebase!")
            return False
        print("✓ Conexão com Firebase estabelecida")

        if not verificar_e_criar_loja():
            print("ERRO: Falha ao verificar/criar loja!")
            return False
        print("✓ Estrutura da loja verificada")

        print("\nInicializando nós básicos no Firebase...")
        try:
            firebase_db.child(pc_status_path).set("ON")
            firebase_db.child(f"{pc_status_path}/timestamp").set(str(int(time.time() * 1000)))
            firebase_db.child(reset_path).set(0)
            firebase_db.child(button_path).set("ON")
            print("✓ Nós básicos inicializados")
        except Exception as e:
            print(f"Erro ao inicializar nós básicos: {e}")
            return False

        print("\nCarregando configuração de heartbeat...")
        carregar_intervalos_firebase()

        print("\n=== CONFIGURANDO LISTENERS ===")
        device_streams = setup_firebase_listeners()
        if device_streams is None:
            device_streams = []
        print(f"✓ {len(device_streams)} listeners UNIFICADOS configurados")

        button_stream = setup_button_listener()
        if button_stream:
            print("✓ Listener de botão configurado")
        
        all_streams = device_streams
        if button_stream:
            all_streams.append(button_stream)
        print(f"\nTotal de {len(all_streams)} listeners ativos")

        print("\n=== VERIFICANDO LISTENERS ===")
        # Testa cada stream
        for i, stream in enumerate(all_streams):
            if stream:
                print(f"Stream {i+1}: Ativo")
            else:
                print(f"Stream {i+1}: INATIVO!")

        print("\nAtualizando heartbeat inicial...")
        if atualizar_heartbeat():
            print("✓ Heartbeat inicial atualizado")
        else:
            print("AVISO: Falha ao atualizar heartbeat inicial")

        print("\nIniciando thread de heartbeat...")
        heartbeat_thread = threading.Thread(target=heartbeat_timer, name="HeartbeatThread")
        heartbeat_thread.daemon = True
        heartbeat_thread.start()
        print("✓ Thread de heartbeat iniciada")

        print("\n=== SISTEMA INICIALIZADO COM SUCESSO ===")
        monitorar_dispositivos_ao_iniciar()
        return True

    except Exception as e:
        print(f"\nERRO CRÍTICO ao inicializar sistema: {e}")
        if all_streams:
            print("Encerrando listeners ativos...")
            for stream in all_streams:
                try:
                    stream.close()
                except:
                    pass
        return False


def heartbeat_timer():
    print("[HEARTBEAT] Iniciando timer de heartbeat...")
    error_count = 0
    max_errors = 5
    while True:
        try:
            try:
                config = firebase_db.child(config_path).get().val()
                intervalo = int(config.get("intervalo_global", 120))
                if intervalo < 10:
                    intervalo = 120
            except:
                intervalo = 120

            success = atualizar_heartbeat()

            if success:
                print(f"[HEARTBEAT] Atualizado ({time.strftime('%H:%M:%S')}). Próxima atualização em {intervalo}s")
                error_count = 0
            else:
                error_count += 1
                print(f"[ERRO][HEARTBEAT] ({error_count}/{max_errors}) ao atualizar heartbeat. Tentando novamente em {intervalo}s")
                if error_count >= max_errors:
                    print("[ERRO][HEARTBEAT] Múltiplas falhas consecutivas. Verifique conexão com Firebase.")

            time.sleep(intervalo)
        except Exception as e:
            error_count += 1
            print(f"[ERRO][HEARTBEAT] Exceção ({error_count}/{max_errors}): {e}")
            recovery_time = min(60, 5 * error_count)
            print(f"[HEARTBEAT] Aguardando {recovery_time}s antes de tentar novamente...")
            time.sleep(recovery_time)


def verificar_rede_background():
    """Função executada em uma thread separada para atualizar todos os dispositivos como online"""
    try:
        print("Atualizando status inicial de todos os dispositivos para ONLINE em segundo plano...")
        atualizar_status_rede()
        print("Atualização inicial concluída!")
    except Exception as e:
        print(f"Erro na atualização de status em segundo plano: {e}")


def verificar_e_criar_loja():
    """Verifica se a loja existe no Firebase e cria caso não exista"""
    if not firebase_db or not store_id:
        print("Firebase não conectado ou STORE_ID não definido!")
        return False

    print(f"Verificando se a loja {store_id} existe no Firebase...")
    try:
        dados_loja = firebase_db.child(store_id).get().val()

        if dados_loja:
            print(f"Loja {store_id} encontrada no Firebase.")

            # Mostrar estrutura básica
            print("\nEstrutura básica da loja:")
            for chave, valor in dados_loja.items():
                if isinstance(valor, dict):
                    print(f"  - {chave}: {len(valor)} item(s)")
                else:
                    valor_str = str(valor)
                    if len(valor_str) > 50:
                        valor_str = valor_str[:47] + "..."
                    print(f"  - {chave}: {valor_str}")
            return True
        else:
            print(f"Loja {store_id} não encontrada. Criando nova loja...")

            # Usar a estrutura modelo definida no código
            estrutura_modelo = MODELO_LOJA_COMPLETO.copy()

            # Criar a nova loja
            firebase_db.child(store_id).set(estrutura_modelo)
            print(f"Loja {store_id} criada com sucesso!")
            return True

    except Exception as e:
        print(f"Erro ao verificar/criar loja: {e}")
        return False


def exibir_evento(tipo_dispositivo, id_dispositivo, acao):
    """Exibe um cabeçalho visual para eventos do Firebase - DESATIVADO para reduzir logs"""
    # Esta função foi desativada para reduzir a quantidade de logs
    pass


def setup_firebase_listeners():
    """Configura apenas um listener unificado no nó base da loja"""
    print("Configurando listener UNIFICADO no nó base...")

    streams = []

    def unified_stream_handler(message):
        if message["event"] != "put":
            return
        path = message["path"]
        if not path or path == "/":
            return
        path = path.lstrip("/")
        if path.startswith("secadoras/"):
            secadoras_stream_handler(message)
        elif path.startswith("lavadoras/"):
            lavadoras_stream_handler(message)
        elif path.startswith("ar_condicionado/"):
            ar_condicionado_stream_handler(message)
        elif path.startswith("dosadora_01/"):
            processar_evento_dosadora(message)

    try:
        unified_stream = firebase_db.child(base_path).stream(unified_stream_handler)
        streams.append(unified_stream)
        print("[SETUP] Listener unificado configurado e ativo!")
        return streams
    except Exception as e:
        print(f"Erro ao configurar listener unificado: {e}")
        return []


def processar_evento_dosadora(message):
    """Handler central para eventos da dosadora dentro do stream unificado."""
    path = message["path"].lstrip("/")
    data = message["data"]

    # Exemplo de path: dosadora_01/432/amaciante
    partes = path.split("/")
    if len(partes) < 3:
        return

    # Exemplo: dosadora_01/432/amaciante
    dosadora_id = partes[1]
    campo = partes[2]

    dosadora = next((d for d in DOSADORAS if d["id"] == dosadora_id), None)
    if not dosadora:
        return
    ip = dosadora["ip"]

    # HANDLER DOS CAMPOS
    if campo == "amaciante" and data and data > 0:
        # Garante que data seja um inteiro
        valor_int = int(data)
        # Validação adicional para amaciante (deve ser positivo)
        if valor_int <= 0:
            print(f"❌ Valor de amaciante inválido: {valor_int} (deve ser maior que 0)")
            return
        print(f"\n>>> Processando amaciante para dosadora {dosadora_id} <<<")
        print(f"- Valor: {valor_int}")
        # Lógica do antigo amaciante_handler
        softener_endpoint = firebase_db.child(f"{dosadora_path}/{dosadora_id}/softener_endpoint").get().val() or f"softener{valor_int}"
        print(f"- Endpoint: {softener_endpoint}")
        sucesso = enviar_http_request(ip, softener_endpoint, 1, device_type="dosadoras", device_id=dosadora_id, tipo="dosadoras")
        firebase_db.child(f"{dosadora_path}/{dosadora_id}/amaciante").set(0)
        status_caminho = f"{status_path}/dosadoras/{dosadora_id}"
        status_valor = "online" if sucesso else "offline"
        firebase_db.child(status_caminho).set(status_valor)
        print(f"- Dosadora {dosadora_id} amaciante processado e resetado para 0")
        print(f"- Status da dosadora {dosadora_id} atualizado para {status_valor}")

    elif campo == "dosagem" and data and data > 0:
        # Garante que data seja um inteiro
        valor_int = int(data)
        # Validação adicional para dosagem (deve ser positivo)
        if valor_int <= 0:
            print(f"❌ Valor de dosagem inválido: {valor_int} (deve ser maior que 0)")
            return
        print(f"\n>>> Processando dosagem para dosadora {dosadora_id} <<<")
        print(f"- Valor: {valor_int}")
        dosagem_endpoint = firebase_db.child(f"{dosadora_path}/{dosadora_id}/dosagem_endpoint").get().val() or "am01-1"
        print(f"- Endpoint: {dosagem_endpoint}")
        sucesso = enviar_http_request(ip, dosagem_endpoint, 1, device_type="dosadoras", device_id=dosadora_id, tipo="dosadoras")
        firebase_db.child(f"{dosadora_path}/{dosadora_id}/dosagem").set(0)
        status_caminho = f"{status_path}/dosadoras/{dosadora_id}"
        status_valor = "online" if sucesso else "offline"
        firebase_db.child(status_caminho).set(status_valor)
        print(f"- Dosadora {dosadora_id} dosagem processada e resetada para 0")
        print(f"- Status da dosadora {dosadora_id} atualizado para {status_valor}")

    elif campo == "bomba" and data and data > 0 and data <= 3:
        # Garante que data seja um inteiro
        valor_int = int(data)
        # Validação adicional para bomba (1-3)
        if valor_int < 1 or valor_int > 3:
            print(f"❌ Valor de bomba inválido: {valor_int} (deve ser entre 1 e 3)")
            return
        print(f"\n>>> Processando bomba para dosadora {dosadora_id} <<<")
        print(f"- Bomba: {valor_int}")
        endpoint = f"/rele{valor_int}on"
        print(f"- Endpoint: {endpoint}")
        sucesso = enviar_http_request(ip, endpoint, 1, device_type="dosadoras", device_id=dosadora_id, tipo="dosadoras")
        firebase_db.child(f"{dosadora_path}/{dosadora_id}/bomba").set(0)
        status_caminho = f"{status_path}/dosadoras/{dosadora_id}"
        status_valor = "online" if sucesso else "offline"
        firebase_db.child(status_caminho).set(status_valor)
        print(f"- Dosadora {dosadora_id} bomba processada e resetada para 0")
        print(f"- Status da dosadora {dosadora_id} atualizado para {status_valor}")

    elif campo == "consulta_tempo" and data is True:
        print(f"\n>>> Consultando tempos para dosadora {dosadora_id} <<<")
        endpoints = ["/consultasb01", "/consultaam01", "/consultaam02"]
        tempo_tipos = ["sabao", "floral", "sport"]
        consulta_sucesso = False
        for endpoint, tipo in zip(endpoints, tempo_tipos):
            tempo_segundos = consultar_tempo_dosadora(ip, endpoint, tipo)
            if tempo_segundos > 0:
                consulta_sucesso = True
            tempo_atual_path = f"{dosadora_path}/{dosadora_id}/tempo_atual_{tipo}"
            firebase_db.child(tempo_atual_path).set(int(tempo_segundos))
        firebase_db.child(f"{dosadora_path}/{dosadora_id}/consulta_tempo").set(False)
        status_caminho = f"{status_path}/dosadoras/{dosadora_id}"
        status_valor = "online" if consulta_sucesso else "offline"
        firebase_db.child(status_caminho).set(status_valor)
        print(f"- Dosadora {dosadora_id} consulta de tempos processada")
        print(f"- Status da dosadora {dosadora_id} atualizado para {status_valor}")

    elif campo.startswith("ajuste_tempo_"):
        print(f"DEBUG: campo={campo}, data={data}, type={type(data)}")
        try:
            tempo_int = int(data)
            if tempo_int > 0:
                tipo_bomba = campo.replace("ajuste_tempo_", "")
                # Validação adicional para tempo (deve ser positivo e razoável)
                if tempo_int > 3600:  # Máximo 1 hora
                    print(f"❌ Valor de tempo muito alto: {tempo_int}s (máximo 3600s)")
                    return
                print(f"\n>>> Processando ajuste de tempo {tipo_bomba.upper()} para dosadora {dosadora_id} <<<")
                print(f"- Tempo: {tempo_int} segundos")
                indice = {"sabao": 0, "floral": 1, "sport": 2}.get(tipo_bomba, 0)
                endpoint = f"/settime?rele={indice+1}&time={tempo_int*1000}"
                print(f"- Endpoint: {endpoint}")
                sucesso = enviar_http_request(ip, endpoint, 1, device_type="dosadoras", device_id=dosadora_id, tipo="dosadoras")
                tempo_path = f"{dosadora_path}/{dosadora_id}/ajuste_tempo_{tipo_bomba}"
                firebase_db.child(tempo_path).set(0)
                tempo_atual_path = f"{dosadora_path}/{dosadora_id}/tempo_atual_{tipo_bomba}"
                firebase_db.child(tempo_atual_path).set(tempo_int)
                status_caminho = f"{status_path}/dosadoras/{dosadora_id}"
                status_valor = "online" if sucesso else "offline"
                firebase_db.child(status_caminho).set(status_valor)
                print(f"- Dosadora {dosadora_id} tempo {tipo_bomba} ajustado para {tempo_int}s")
                print(f"- Status da dosadora {dosadora_id} atualizado para {status_valor}")
        except Exception as e:
            print(f"Valor inválido para ajuste de tempo: {data} ({type(data)}) - Erro: {e}")


def exibir_status_dispositivos():
    """Exibe um resumo do status de todos os dispositivos - DESATIVADO para reduzir logs"""
    # Esta função foi desativada para reduzir a quantidade de logs
    pass


def main():
    global heartbeat_interval
    try:
        # Mostra banner inicial
        print("\n" + "="*60)
        print("=== Sistema de Gerenciamento ESP8266 - VERSÃO COM MONITORAMENTO ===")
        print("="*60)
        print("\n▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")
        print("▓     EXECUTANDO COM MONITORAMENTO DE REDE      ▓")
        print("▓      VERIFICAÇÃO PERIÓDICA VIA PING           ▓")
        print("▓         MÁXIMA CONFIABILIDADE                 ▓")
        print("▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓\n")
        print("● FUNCIONALIDADES:")
        print("  1. Envia comandos HTTP quando solicitado pelo Firebase")
        print("  2. Atualiza o heartbeat periodicamente")
        print("  3. Monitora status dos dispositivos via ping")
        print("  4. Processa comandos de reset quando necessário\n")
        # Inicializa o sistema
        if not inicializar_sistema():
            print("Falha na inicialização do sistema! Abortando.")
            return
        # Configurações atuais
        try:
            config = firebase_db.child(config_path).get().val()
            intervalo = int(config.get("intervalo_global", 120))
        except:
            intervalo = 120
        print("\nConfiguração atual:")
        print(f"● Heartbeat: a cada {intervalo}s")
        print(f"● Verificação de rede: a cada {intervalo}s")
        print(f"● Firebase: {base_path}")
        print("\nSistema rodando. Pressione Ctrl+C para encerrar...\n")
        # Loop principal
        loop_principal()
    except KeyboardInterrupt:
        print("\nEncerrando por solicitação do usuário (Ctrl+C)...")
    except Exception as e:
        print(f"\nERRO CRÍTICO: {e}")
    finally:
        # Limpeza final
        print("Fechando conexões e listeners...")
        if 'all_streams' in globals() and all_streams:
            for stream in all_streams:
                try:
                    stream.close()
                except:
                    pass
        print("Sistema encerrado!")


def carregar_intervalos_firebase():
    """Carrega os intervalos de heartbeat e verificação de rede do Firebase"""
    global heartbeat_interval

    if not firebase_db or not config_path:
        print("Firebase não inicializado corretamente")
        heartbeat_interval = HEARTBEAT_INTERVAL
        return False

    try:
        # Tenta carregar do nó de configuração consolidado
        config = firebase_db.child(config_path).get().val()

        if config and isinstance(config, dict):
            # Carrega heartbeat_interval
            if "intervalo_global" in config:
                valor = config["intervalo_global"]
                if isinstance(valor, (int, float)) and valor >= 60:
                    heartbeat_interval = int(valor)
                    print(
                        f"Intervalo de heartbeat carregado: {heartbeat_interval}s")
                else:
                    heartbeat_interval = HEARTBEAT_INTERVAL
                    print(
                        f"Usando intervalo de heartbeat padrão: {HEARTBEAT_INTERVAL}s")

            # Carrega network_check_interval
            if "network_check_interval" in config:
                valor = config["network_check_interval"]
                if isinstance(valor, (int, float)) and valor >= 60:
                    print(
                        f"Intervalo de verificação de rede carregado: {valor}s")
                else:
                    # Define o valor padrão
                    firebase_db.child(
                        f"{config_path}/network_check_interval").set(NETWORK_CHECK_INTERVAL)
                    print(
                        f"Usando intervalo de verificação de rede padrão: {NETWORK_CHECK_INTERVAL}s")
            else:
                # Cria o campo se não existir
                firebase_db.child(
                    f"{config_path}/network_check_interval").set(NETWORK_CHECK_INTERVAL)
                print(
                    f"Criado intervalo de verificação de rede padrão: {NETWORK_CHECK_INTERVAL}s")

        # Atualiza os intervalos no Firebase
        atualizar_intervalos_firebase()
        return True

    except Exception as e:
        print(f"Erro ao carregar intervalos: {e}")
        heartbeat_interval = HEARTBEAT_INTERVAL
        print(
            f"Usando intervalos padrão após erro: Heartbeat={HEARTBEAT_INTERVAL}s, Rede={NETWORK_CHECK_INTERVAL}s")
        return False


def atualizar_intervalos_firebase():
    """Atualiza os intervalos no Firebase"""
    if not firebase_db or not config_path:
        return False

    try:
        # Obtém timestamp atual em milissegundos
        timestamp_ms = int(time.time() * 1000)

        # Cria uma única operação de atualização
        updates = {
            f"{config_path}/intervalo_global": heartbeat_interval,
            f"{config_path}/network_check_interval": NETWORK_CHECK_INTERVAL,
            f"{config_path}/last_update": str(timestamp_ms)
        }

        # Executa as atualizações em uma única operação
        firebase_db.update(updates)

        return True
    except Exception as e:
        print(f"Erro ao atualizar intervalos no Firebase: {e}")
        return False


def atualizar_status_rede():
    """Versão simplificada que apenas marca todos os dispositivos como online no Firebase"""
    print("\n=== Atualizando status de todos os dispositivos para ONLINE (sem verificação de rede) ===")
    dispositivos = []
    for lavadora in LAVADORAS:
        dispositivos.append({
            "ip": lavadora["ip"],
            "id": lavadora["id"],
            "tipo": "lavadoras"
        })
    secadora_ips = set()
    for secadora in SECADORAS:
        if secadora["ip"] not in secadora_ips:
            secadora_ips.add(secadora["ip"])
            dispositivos.append({
                "ip": secadora["ip"],
                "id": secadora["id"],
                "tipo": "secadoras"
            })
    for dosadora in DOSADORAS:
        dispositivos.append({
            "ip": dosadora["ip"],
            "id": dosadora["id"],
            "tipo": "dosadoras"
        })
    dispositivos.append({
        "ip": "10.1.40.110",
        "id": "AC",
        "tipo": "ar_condicionado"
    })
    total_dispositivos = len(dispositivos)
    print(f"Atualizando {total_dispositivos} dispositivos como ONLINE...")
    for dispositivo in dispositivos:
        try:
            id_dispositivo = dispositivo["id"]
            tipo = dispositivo["tipo"]
            atualizar_estado_dispositivo(id_dispositivo, tipo, True)
        except Exception as e:
            print(
                f"Erro ao atualizar {dispositivo['tipo']} {dispositivo['id']}: {e}")
    print(
        f"Atualização concluída. Todos os {total_dispositivos} dispositivos marcados como ONLINE.")
    return total_dispositivos


def ping_dispositivo(ip, tentativas=1, timeout=1000):
    """
    Faz um ping no IP do dispositivo.
    Retorna True se o dispositivo responder em qualquer tentativa, False se todas falharem.
    Mais rigoroso: exige que a resposta contenha o IP de destino.
    """
    import platform
    param = '-n' if platform.system().lower() == 'windows' else '-c'
    timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'
    for tentativa in range(3):
        try:
            comando = ['ping', param, '1', timeout_param, str(timeout), ip]
            kwargs = {
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
                "text": True
            }
            if platform.system().lower() == 'windows':
                kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
            resultado = subprocess.run(comando, **kwargs)
            saida = resultado.stdout.lower()
            # Checagem rigorosa:
            if resultado.returncode == 0:
                if platform.system().lower() == 'windows':
                    if f"resposta de {ip}" in saida and "tempo limite" not in saida:
                        if tentativa > 0:
                            print(
                                f"Dispositivo {ip} respondeu na tentativa {tentativa + 1}")
                        return True
                else:
                    if f"bytes from {ip}" in saida:
                        if tentativa > 0:
                            print(
                                f"Dispositivo {ip} respondeu na tentativa {tentativa + 1}")
                        return True
        except Exception as e:
            print(f"Erro ao pingar {ip}: {e}")
            time.sleep(1)
    print(f"Todas as tentativas falharam para {ip}")
    return False


def monitorar_dispositivos_ao_iniciar():
    """
    Faz ping em cada IP único dos dispositivos ao iniciar o servidor e atualiza o status no Firebase.
    Mostra apenas uma linha por tipo e id único, no formato 'Lavadora 432 (ip): ONLINE'.
    """
    print("Monitorando dispositivos ao iniciar o servidor...")
    dispositivos = []
    dispositivos.extend(LAVADORAS)
    dispositivos.extend(SECADORAS)
    dispositivos.extend(DOSADORAS)
    dispositivos.append(
        {"id": "AC", "ip": "10.1.40.110", "type": "ar_condicionado"})

    # Agrupa dispositivos por IP
    ip_to_devices = {}
    for dispositivo in dispositivos:
        ip = dispositivo["ip"]
        if ip not in ip_to_devices:
            ip_to_devices[ip] = []
        ip_to_devices[ip].append(dispositivo)

    # Faz ping em cada IP único e atualiza todos os dispositivos daquele IP
    for ip, devices in ip_to_devices.items():
        online = ping_dispositivo(ip)
        # Para cada combinação única de tipo e id, mostra uma linha
        vistos = set()
        for dispositivo in devices:
            tipo = dispositivo.get("type")
            id_dispositivo = dispositivo["id"]
            if not tipo and dispositivo in DOSADORAS:
                tipo = "dosadoras"
            elif not tipo:
                tipo = "desconhecido"
            chave = (tipo, id_dispositivo)
            if chave not in vistos:
                vistos.add(chave)
                tipo_str = tipo.capitalize(
                )[:-1] if tipo and tipo.endswith('s') else tipo.capitalize()
                print(
                    f"{tipo_str} {id_dispositivo} ({ip}): {'ONLINE' if online else 'OFFLINE'}")
            atualizar_estado_dispositivo(id_dispositivo, tipo, online)


def secadoras_stream_handler(message):
    print("\n=== NOVO EVENTO FIREBASE - SECADORAS ===")
    print(f"Evento: {message['event']}")
    print(f"Path: {message['path']}")
    print(f"Data: {message['data']}")
    print("===========================")

    if message["event"] == "put":
        path = message["path"]
        data = message["data"]

        # Debug para todos os eventos
        print(f"\nDEBUG - Evento recebido para secadoras:")
        print(f"- Path completo: {secadoras_path}{path}")
        print(f"- Path processado: {path}")
        print(f"- Tipo de dado: {type(data)}")
        print(f"- Valor: {data}")
        timestamp_evento = time.time()

        # Ignora eventos de nível superior ou quando o valor é None
        if not path or data is None or path == "/":
            print("DEBUG - Evento ignorado: nível superior ou None")
            return

        # Remove a barra inicial do path se existir
        if path.startswith('/'):
            path = path[1:]

        # Remove o prefixo 'secadoras/' se existir
        if path.startswith('secadoras/'):
            path = path.replace('secadoras/', '')

        # Extrai o ID da secadora e o tempo do path
        id_secadora_completo = path
        print(f"DEBUG - ID da secadora completo extraído: {id_secadora_completo}")

        # Verifica se o formato é válido (ID_MINUTOS)
        if "_" not in id_secadora_completo:
            print(f"❌ Erro: Formato de ID de secadora inválido: {id_secadora_completo}")
            print(f"Formato esperado: ID_MINUTOS (ex: 765_45)")
            return

        # Separa o ID da secadora e o tempo
        partes = id_secadora_completo.split("_")
        if len(partes) != 2:
            print(f"❌ Erro: Formato de ID de secadora inválido: {id_secadora_completo}")
            return

        id_secadora = partes[0]
        minutos = int(partes[1])

        print(f"DEBUG - ID da secadora: {id_secadora}, Tempo: {minutos} minutos, Tipo: {type(minutos)}")

        # Garante que minutos seja inteiro
        try:
            minutos_int = int(minutos)
        except Exception:
            minutos_int = minutos

        # Verifica se é uma secadora válida
        secadoras_ids = [s["id"] for s in SECADORAS]
        print(f"DEBUG - IDs de secadoras válidos: {secadoras_ids}")

        # Loga o valor anterior do Firebase
        valor_anterior = firebase_db.child(secadoras_path).child(id_secadora_completo).get().val()
        print(f"LOG - Valor anterior no Firebase para {id_secadora_completo}: {valor_anterior}")
        print(f"LOG - Novo valor recebido: {data}")
        print(f"LOG - Timestamp do evento: {timestamp_evento}")

        # Controle de duplicidade por tempo (10s)
        ultimo_comando_key = f"secadora_{id_secadora_completo}_ultimo_comando"
        agora = time.time()
        if not hasattr(secadoras_stream_handler, 'cache'):
            secadoras_stream_handler.cache = {}
        cache_local = secadoras_stream_handler.cache
        if data == "liberando" or data is True:
            if ultimo_comando_key in cache_local and (agora - cache_local[ultimo_comando_key]) < 10:
                print(f"Ignorando evento duplicado para secadora {id_secadora_completo} (liberação recente <10s). Última: {cache_local[ultimo_comando_key]}, Agora: {agora}")
                return
            cache_local[ultimo_comando_key] = agora

        if id_secadora in secadoras_ids:
            print(f"\n>>> Verificando secadora {id_secadora} (duração: {minutos} min, status: {data}) <<<")

            # Trata o estado "liberando" ou True
            if data == "liberando" or data is True:
                print(f"DEBUG - Iniciando liberação para secadora {id_secadora} por {minutos} minutos")
                # Encontra a secadora correspondente
                secadora_atual = None
                for secadora in SECADORAS:
                    if secadora["id"] == id_secadora:
                        secadora_atual = secadora
                        break

                if not secadora_atual:
                    print(f"❌ Erro: Secadora {id_secadora} não encontrada!")
                    return

                print(f"\n>>> Verificando secadora {id_secadora} antes da liberação <<<")
                # Faz ping individual antes de prosseguir
                online = ping_dispositivo(secadora_atual["ip"])
                if not online:
                    print(f"❌ Erro: Secadora {id_secadora} está offline!")
                    # Atualiza o status para offline imediatamente
                    firebase_db.child(f"{status_path}/secadoras/{id_secadora}").set("offline")
                    # Reseta o valor no Firebase
                    firebase_db.child(secadoras_path).child(id_secadora_completo).set(False)
                    return

                print(f"✓ Secadora {id_secadora} está online, prosseguindo com liberação...")
                print(f"IP Secadora: {secadora_atual['ip']}")

                # Atualiza status da secadora para online imediatamente
                print(f"Atualizando status inicial da secadora {id_secadora} para online")
                firebase_db.child(f"{status_path}/secadoras/{id_secadora}").set("online")

                # Define o número de GETs com base no tempo
                if minutos_int == 45:
                    num_gets = 3
                elif minutos_int == 30:
                    num_gets = 2
                elif minutos_int == 15:
                    num_gets = 1
                else:
                    num_gets = 1

                sucesso_secadora = False
                for i in range(num_gets):
                    # Envia o comando para a secadora
                    sucesso_secadora = enviar_http_request(
                        secadora_atual["ip"], secadora_atual["endpoint"], num_gets=1, device_type="secadoras", device_id=id_secadora, tipo="secadoras")
                    # Após o primeiro GET, já reseta o valor no Firebase
                    if i == 0:
                        firebase_db.child(secadoras_path).child(id_secadora_completo).set(False)

                    # Delay entre GETs, exceto após o último
                    if i < num_gets - 1:
                        print(f"Aguardando {DELAY_BETWEEN_GETS}s antes da próxima requisição...")
                        time.sleep(DELAY_BETWEEN_GETS)

                if sucesso_secadora:
                    print(f"\n✅ SECADORA {id_secadora} LIBERADA POR {minutos} MINUTOS!")
                else:
                    # Mensagem menos alarmante
                    if online:
                        print("\n⚠️ TIMEOUT NA RESPOSTA DA SECADORA (NORMAL)")
                        print("✓ Secadora está online e provavelmente processou o comando")
                        print("✓ Verifique se a secadora foi ativada")
                    else:
                        print("\n❌ FALHA NA LIBERAÇÃO DA SECADORA!")
                        # Atualiza o status para offline em caso de falha
                        firebase_db.child(f"{status_path}/secadoras/{id_secadora}").set("offline")

            else:
                # Para outros estados, apenas verifica se está online
                for secadora in SECADORAS:
                    if secadora["id"] == id_secadora:
                        online = ping_dispositivo(secadora["ip"])
                        if online:
                            print(f"Secadora {id_secadora} está online")
                            firebase_db.child(f"{status_path}/secadoras/{id_secadora}").set("online")
                        else:
                            print(f"Secadora {id_secadora} está offline")
                            firebase_db.child(f"{status_path}/secadoras/{id_secadora}").set("offline")
                        break


def reset_lavadora_status(id_lavadora):
    """Reseta o status da lavadora para False após o timer"""
    print(f"Timer expirado: Resetando status da lavadora {id_lavadora} para False")
    # Reseta o valor no Firebase
    firebase_db.child(lavadoras_path).child(id_lavadora).set(False)
    # Reseta o status para offline
    firebase_db.child(f"{status_path}/lavadoras/{id_lavadora}").set("offline")
    if id_lavadora in reset_timers:
        del reset_timers[id_lavadora]

def lavadoras_stream_handler(message):
    print("\n=== NOVO EVENTO FIREBASE - LAVADORAS ===")
    print(f"Evento: {message['event']}")
    print(f"Path: {message['path']}")
    print(f"Data: {message['data']}")
    print(f"MESSAGE COMPLETO: {message}")
    print("===========================")

    if message["event"] == "put":
        path = message["path"]
        data = message["data"]

        if not path or data is None or path == "/":
            print("DEBUG - Evento ignorado: nível superior ou None")
            return

        if path.startswith('/'):
            path = path[1:]

        # Remove o prefixo 'lavadoras/' se existir
        if path.startswith('lavadoras/'):
            path = path.replace('lavadoras/', '')

        id_lavadora = path
        if id_lavadora not in [l["id"] for l in LAVADORAS]:
            print(f"ID de lavadora não reconhecido: {id_lavadora}")
            return

        if data is True or data == "liberando":
            # Busca IP e endpoint
            lavadora = next(l for l in LAVADORAS if l["id"] == id_lavadora)
            ip = lavadora["ip"]
            endpoint = lavadora["endpoint"]
            
            print(f"\n>>> Verificando lavadora {id_lavadora} antes da liberação <<<")
            # Faz ping individual antes de prosseguir
            online = ping_dispositivo(ip)
            if not online:
                print(f"❌ Erro: Lavadora {id_lavadora} está offline!")
                # Atualiza o status para offline imediatamente
                firebase_db.child(f"{status_path}/lavadoras/{id_lavadora}").set("offline")
                # Reseta o valor no Firebase
                firebase_db.child(lavadoras_path).child(id_lavadora).set(False)
                return

            # Verifica se a dosadora correspondente está online
            dosadora_id = id_lavadora  # Mesmo ID da lavadora
            print(f"\n>>> Verificando dosadora {dosadora_id} antes da liberação da lavadora <<<")
            dosadora = next((d for d in DOSADORAS if d["id"] == dosadora_id), None)
            
            if dosadora:
                dosadora_online = ping_dispositivo(dosadora["ip"])
                if not dosadora_online:
                    print(f"❌ Erro: Dosadora {dosadora_id} está offline!")
                    # Atualiza o status da dosadora para offline
                    firebase_db.child(f"{status_path}/dosadoras/{dosadora_id}").set("offline")
                    print(f"⚠️ Não é possível liberar a lavadora {id_lavadora} pois a dosadora está offline")
                    # Reseta o valor no Firebase
                    firebase_db.child(lavadoras_path).child(id_lavadora).set(False)
                    return
                else:
                    print(f"✓ Dosadora {dosadora_id} está online")
                    # Atualiza o status da dosadora para online
                    firebase_db.child(f"{status_path}/dosadoras/{dosadora_id}").set("online")
            else:
                print(f"⚠️ Aviso: Não foi encontrada dosadora correspondente para lavadora {id_lavadora}")

            print(f"✓ Lavadora {id_lavadora} está online, prosseguindo com liberação...")
            # Atualiza o status da lavadora para online
            firebase_db.child(f"{status_path}/lavadoras/{id_lavadora}").set("online")
            
            url = f"http://{ip}/{endpoint}"
            print(f"Enviando GET para liberar lavadora: {url}")

            try:
                import requests
                response = requests.get(url, timeout=4)
                print(f"Resposta HTTP: {response.status_code} - {response.text}")
                
                # Se a requisição foi bem sucedida, reseta o valor no Firebase
                firebase_db.child(lavadoras_path).child(id_lavadora).set(False)
            except Exception as e:
                print(f"Erro ao enviar GET para lavadora: {e}")
                # Em caso de erro na comunicação, marca como offline
                firebase_db.child(f"{status_path}/lavadoras/{id_lavadora}").set("offline")
                # Reseta o valor no Firebase
                firebase_db.child(lavadoras_path).child(id_lavadora).set(False)


def ar_condicionado_stream_handler(message):
    print("\n=== NOVO EVENTO FIREBASE - AR CONDICIONADO ===")
    print(f"Evento: {message['event']}")
    print(f"Path: {message['path']}")
    print(f"Data: {message['data']}")
    print(f"MESSAGE COMPLETO: {message}")
    print("===========================")

    if message["event"] == "put":
        path = message["path"]
        data = message["data"]

        if not path or path == "/":
            print("DEBUG - Evento ignorado: nível superior ou None")
            return

        if path.startswith('/'):
            path = path[1:]

        # Remove o prefixo 'ar_condicionado/' se existir
        if path.startswith('ar_condicionado/'):
            path = path.replace('ar_condicionado/', '')

        ac_cmd = path.upper()  # path será '18', '22' ou 'OFF'
        if ac_cmd == '18':
            endpoint = 'airon1'
        elif ac_cmd == '22':
            endpoint = 'airon2'
        elif ac_cmd == 'OFF':
            endpoint = 'airon3'
        else:
            print(f"Comando de ar-condicionado não reconhecido: {ac_cmd}")
            return

        ip = '10.1.40.110'  # IP fixo do ar-condicionado
        
        # Verifica se o ar-condicionado está online antes de prosseguir
        online = ping_dispositivo(ip)
        if not online:
            print(f"❌ Erro: Ar-condicionado está offline!")
            # Atualiza o status para offline
            firebase_db.child(f"{status_path}/ar_condicionado").set("offline")
            # Reseta o valor no Firebase
            firebase_db.child(ar_path).child(ac_cmd).set(False)
            return

        # Se chegou aqui, o dispositivo está online
        firebase_db.child(f"{status_path}/ar_condicionado").set("online")
        
        url = f"http://{ip}/{endpoint}"
        print(f"Enviando GET para ar-condicionado: {url}")
        try:
            import requests
            response = requests.get(url, timeout=4)
            print(f"Resposta HTTP: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Erro ao enviar GET para ar-condicionado: {e}")
            # Em caso de erro na comunicação, marca como offline
            firebase_db.child(f"{status_path}/ar_condicionado").set("offline")

        # Reseta o valor no Firebase
        firebase_db.child(ar_path).child(ac_cmd).set(False)


if __name__ == "__main__":
    main()