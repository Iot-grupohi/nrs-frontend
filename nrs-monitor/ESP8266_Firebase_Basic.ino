#include <ESP8266WiFi.h>
#include <FirebaseESP8266.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <EEPROM.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include <time.h>

// Configurações do WiFi
#define WIFI_SSID "HI - LAB"
#define WIFI_PASSWORD "@ikli2027"

// Configurações do Firebase
#define DATABASE_URL "https://hi-pag-303ad-default-rtdb.firebaseio.com/"
#define API_KEY "AIzaSyDrRNKUa6Bcy-woSUB5vgh4YGKNIS-v6ls"

// Configurações da EEPROM
#define EEPROM_SIZE 32
#define EEPROM_INITIALIZED_FLAG 0xAA
#define STORE_CODE_MAX_LENGTH 10

// Código padrão da loja (usado apenas se não houver código salvo na EEPROM)
#define DEFAULT_STORE_CODE "PB05"

// Variável global para armazenar o código da loja
char storeCode[STORE_CODE_MAX_LENGTH + 1] = DEFAULT_STORE_CODE;

// Definições do webserver
ESP8266WebServer server(80);
bool webServerStarted = false;

// Strings de caminhos no Firebase que serão definidas após a leitura do código da loja
String basePath;
String lavadorasPath;
String secadorasPath;
String arPath;
String statusPath;
String dosadoraPath;
String pcStatusPath;
String resetPath;
String buttonPath; // Caminho para o status do totem

// Define os pinos do ESP8266
#define LED_BUILTIN 2  // LED embutido do ESP8266
#define PIN_D5 D6      // Pino D5 do ESP8266
#define BUTTON_PIN D1  // Pino do botão (GPIO5)

// Timeout para requisições HTTP
#define HTTP_TIMEOUT 2000  // 2 segundos
#define CHECK_INTERVAL 50  // 50ms
#define CACHE_TIMEOUT 5000 // 5 segundos para cache
#define MAX_RETRIES 3     // Número máximo de tentativas
#define RETRY_DELAY 100   // Delay entre tentativas

// Enums para configuração da dosadora
enum Amaciante {
  NENHUM = 0,
  FLORAL = 1,
  SPORT = 2
};

enum Dosagem {
  SIMPLES = 1,
  DUPLA = 2
};

// Estruturas
struct DosadoraConfig {
  const char* id;
  const char* ip;
  const char* comandos[3] = {
    "/rele1on",  // Sabão
    "/rele2on",  // Amaciante Floral
    "/rele3on"   // Amaciante Sport
  };
  const char* setTimeEndpoints[3] = {
    "/settime?rele=1&time=",  // Sabão
    "/settime?rele=2&time=",  // Amaciante Floral
    "/settime?rele=3&time="   // Amaciante Sport
  };
  const char* consultaEndpoints[3] = {
    "/consultasb01",  // Sabão
    "/consultaam01",  // Amaciante Floral
    "/consultaam02"   // Amaciante Sport
  };
};

struct Device {
  const char* id;
  const char* ip;
  const char* endpoint;
  const char* type;  // "lavadoras" ou "secadoras"
  bool isAC;
  int numGets;
};

struct DosadoraValues {
  int amaciante;
  int dosagem;
};

struct CacheEntry {
  String path;
  String value;
  unsigned long timestamp;
};

// Estrutura para configuração do ar condicionado
struct ACConfig {
  const char* temp;
  const char* endpoint;
};

// Configurações do ar condicionado
const ACConfig acConfigs[] = {
  {"18", "airon1"},
  {"22", "airon2"},
  {"OFF", "airon3"}
};

// Configurações do Firebase
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Variáveis de controle
unsigned long lastCheck = 0;
unsigned long lastCacheUpdate = 0;
static uint8_t currentDeviceIndex = 0;
bool lastButtonState = false;  // Estado anterior do botão
unsigned long lastDebounceTime = 0;  // Última vez que o botão mudou de estado
#define DEBOUNCE_DELAY 50  // Delay para debounce do botão
unsigned long resetStartTime = 0;  // Tempo de início do reset
bool isResetting = false;  // Flag para indicar se está em reset
int resetCommand = 0;  // Comando atual do reset (0 = espera, 1 = 1s, 2 = 13s)
unsigned long lastLoopTime = 0;  // Última vez que o loop foi executado
unsigned long loopCount = 0;  // Contador de loops para verificação do watchdog
unsigned long lastHeartbeatUpdate = 0;  // Última atualização do heartbeat

// Cache para valores do Firebase
#define MAX_CACHE_ENTRIES 20
CacheEntry cache[MAX_CACHE_ENTRIES];
uint8_t cacheIndex = 0;

// Array com as configurações das dosadoras
const DosadoraConfig dosadoras[] = {
  {"432", "10.1.40.151"},
  {"543", "10.1.40.152"},
  {"654", "10.1.40.153"}
};

// Array com as configurações das secadoras
const Device secadoras[] = {
  {"765", "10.1.40.104", "_15", "secadoras", false, 1},
  {"765", "10.1.40.104", "_30", "secadoras", false, 2},
  {"765", "10.1.40.104", "_45", "secadoras", false, 3},
  {"876", "10.1.40.105", "_15", "secadoras", false, 1},
  {"876", "10.1.40.105", "_30", "secadoras", false, 2},
  {"876", "10.1.40.105", "_45", "secadoras", false, 3},
  {"987", "10.1.40.106", "_15", "secadoras", false, 1},
  {"987", "10.1.40.106", "_30", "secadoras", false, 2},
  {"987", "10.1.40.106", "_45", "secadoras", false, 3}
};

// Array com as configurações das lavadoras
const Device lavadoras[] = {
  {"432", "10.1.40.101", "lb", "lavadoras", false, 1},
  {"543", "10.1.40.102", "lb", "lavadoras", false, 1},
  {"654", "10.1.40.103", "lb", "lavadoras", false, 1}
};

// Variáveis para armazenar valores anteriores
DosadoraValues lastValues[3] = {{0,1}, {0,1}, {0,1}}; // Para 432, 543 e 654

// Adicionar configurações NTP após as definições existentes
#define NTP_SERVER "pool.ntp.org"
#define GMT_OFFSET_SEC 3600 * (-3) // GMT-3 para Brasil
#define DAYLIGHT_OFFSET_SEC 0

// Função para buscar valor no cache
String getCachedValue(const String& path) {
  for (uint8_t i = 0; i < cacheIndex; i++) {
    if (cache[i].path == path && (millis() - cache[i].timestamp) < CACHE_TIMEOUT) {
      return cache[i].value;
    }
  }
  return "";
}

// Função para adicionar valor ao cache
void addToCache(const String& path, const String& value) {
  // Procura por entrada existente
  for (uint8_t i = 0; i < cacheIndex; i++) {
    if (cache[i].path == path) {
      cache[i].value = value;
      cache[i].timestamp = millis();
      return;
    }
  }
  
  // Adiciona nova entrada
  if (cacheIndex < MAX_CACHE_ENTRIES) {
    cache[cacheIndex].path = path;
    cache[cacheIndex].value = value;
    cache[cacheIndex].timestamp = millis();
    cacheIndex++;
  } else {
    // Substitui a entrada mais antiga
    uint8_t oldestIndex = 0;
    unsigned long oldestTime = cache[0].timestamp;
    for (uint8_t i = 1; i < MAX_CACHE_ENTRIES; i++) {
      if (cache[i].timestamp < oldestTime) {
        oldestTime = cache[i].timestamp;
        oldestIndex = i;
      }
    }
    cache[oldestIndex].path = path;
    cache[oldestIndex].value = value;
    cache[oldestIndex].timestamp = millis();
  }
}

// Função para enviar requisição HTTP otimizada com retry
bool sendHttpRequest(const char* ip, const char* endpoint, int numGets) {
  WiFiClient client;
  HTTPClient http;
  String url = "http://" + String(ip) + "/" + String(endpoint);
  bool success = true;
  int retryCount = 0;
  
  // Configurações otimizadas do HTTPClient
  http.setReuse(true);  // Reutiliza conexão
  http.setTimeout(HTTP_TIMEOUT);
  
  for(int i = 0; i < numGets && success; i++) {
    retryCount = 0;
    while (retryCount < MAX_RETRIES) {
      if (!http.begin(client, url)) {
        Serial.printf("Falha ao iniciar conexão HTTP para %s\n", url.c_str());
        retryCount++;
        delay(RETRY_DELAY);
        continue;
      }
      
      int httpCode = http.GET();
      
      if (httpCode > 0) {
        Serial.printf("GET %d/%d - HTTP Response code: %d\n", i+1, numGets, httpCode);
        success = true;
        break;
      } else {
        Serial.printf("GET %d/%d - HTTP Request failed: %d (Tentativa %d/%d)\n", 
                     i+1, numGets, httpCode, retryCount + 1, MAX_RETRIES);
        retryCount++;
        delay(RETRY_DELAY);
        success = false;
      }
      
      http.end();
    }
    
    if (!success) {
      Serial.printf("Falha após %d tentativas para %s\n", MAX_RETRIES, url.c_str());
      break;
    }
    
    if (i < numGets - 1) {
      delay(50); // Delay reduzido entre GETs
    }
  }
  
  http.end();
  return success;
}

// Função para enviar comando de bomba para a dosadora
void sendDosadoraBomba(const char* id, int bomba) {
  const DosadoraConfig* dosadora = nullptr;
  for (const DosadoraConfig& d : dosadoras) {
    if (strcmp(d.id, id) == 0) {
      dosadora = &d;
      break;
    }
  }
  if (!dosadora) return;
  
  const char* bombaName;
  switch(bomba) {
    case 1: bombaName = "Sabão"; break;
    case 2: bombaName = "Amaciante Floral"; break;
    case 3: bombaName = "Amaciante Sport"; break;
    default: return;
  }
  
  Serial.printf("\n>>> Acionamento de Bomba para Dosadora %s <<<\n", id);
  Serial.printf("- Bomba: %s\n", bombaName);
  Serial.printf("- IP: %s\n", dosadora->ip);
  Serial.printf("- Endpoint: %s\n", dosadora->comandos[bomba-1]);
  
  WiFiClient client;
  HTTPClient http;
  String url = "http://" + String(dosadora->ip) + dosadora->comandos[bomba-1];
  
  http.setTimeout(HTTP_TIMEOUT);
  bool success = false;
  
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      Serial.printf("- Status: Sucesso (HTTP %d)\n", httpCode);
      Serial.printf("- Bomba acionada com sucesso!\n");
      success = true;
    } else {
      Serial.printf("- Status: Falha (HTTP %d)\n", httpCode);
      Serial.printf("- Erro ao acionar bomba!\n");
      success = false;
    }
    http.end();
  } else {
    Serial.println("- Status: Falha ao iniciar conexão HTTP");
    Serial.println("- Erro ao conectar com a dosadora!");
    success = false;
  }
  
  // Atualiza o status da dosadora no Firebase
  updateDosadoraStatus(id, success);
  
  Serial.println("----------------------------------------\n");
}

// Função para configurar o tempo de uma bomba
void setDosadoraTime(const char* id, int bomba, int tempo) {
  const DosadoraConfig* dosadora = nullptr;
  for (const DosadoraConfig& d : dosadoras) {
    if (strcmp(d.id, id) == 0) {
      dosadora = &d;
      break;
    }
  }
  if (!dosadora) return;
  
  const char* bombaName;
  switch(bomba) {
    case 1: bombaName = "Sabão"; break;
    case 2: bombaName = "Amaciante Floral"; break;
    case 3: bombaName = "Amaciante Sport"; break;
    default: return;
  }
  
  Serial.printf("\n>>> Ajuste de Tempo para Dosadora %s <<<\n", id);
  Serial.printf("- Bomba: %s\n", bombaName);
  Serial.printf("- Tempo Desejado: %d segundos\n", tempo);
  Serial.printf("- IP: %s\n", dosadora->ip);
  
  int tempoMs = tempo * 1000;
  String url = "http://" + String(dosadora->ip) + dosadora->setTimeEndpoints[bomba-1] + String(tempoMs);
  Serial.printf("- Endpoint: %s\n", dosadora->setTimeEndpoints[bomba-1]);
  
  WiFiClient client;
  HTTPClient http;
  bool success = false;
  
  http.setTimeout(HTTP_TIMEOUT);
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      Serial.printf("- Status: Sucesso (HTTP %d)\n", httpCode);
      Serial.printf("- Tempo configurado com sucesso!\n");
      Serial.printf("- Valor: %d segundos (%d ms)\n", tempo, tempoMs);
      success = true;
    } else {
      Serial.printf("- Status: Falha (HTTP %d)\n", httpCode);
      Serial.printf("- Erro ao configurar tempo!\n");
      success = false;
    }
    http.end();
  } else {
    Serial.println("- Status: Falha ao iniciar conexão HTTP");
    Serial.println("- Erro ao conectar com a dosadora!");
    success = false;
  }
  
  // Atualiza o status da dosadora no Firebase
  updateDosadoraStatus(id, success);
  
  Serial.println("----------------------------------------\n");
}

// Função para consultar o tempo de uma bomba
void consultaDosadoraTime(const char* id, int bomba) {
  const DosadoraConfig* dosadora = nullptr;
  for (const DosadoraConfig& d : dosadoras) {
    if (strcmp(d.id, id) == 0) {
      dosadora = &d;
      break;
    }
  }
  if (!dosadora) return;
  
  const char* bombaName;
  switch(bomba) {
    case 1: bombaName = "Sabão"; break;
    case 2: bombaName = "Amaciante Floral"; break;
    case 3: bombaName = "Amaciante Sport"; break;
    default: return;
  }
  
  Serial.printf("\n>>> Consulta de Tempo para Dosadora %s <<<\n", id);
  Serial.printf("- Bomba: %s\n", bombaName);
  Serial.printf("- IP: %s\n", dosadora->ip);
  Serial.printf("- Endpoint: %s\n", dosadora->consultaEndpoints[bomba-1]);
  
  WiFiClient client;
  HTTPClient http;
  String url = "http://" + String(dosadora->ip) + dosadora->consultaEndpoints[bomba-1];
  bool success = false;
  
  http.setTimeout(HTTP_TIMEOUT);
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      int tempoMs = payload.toInt();
      int tempoSegundos = tempoMs / 1000;
      
      Serial.printf("- Status: Sucesso (HTTP %d)\n", httpCode);
      Serial.printf("- Tempo atual: %d segundos\n", tempoSegundos);
      
      String basePath = dosadoraPath + "/" + id;
      String timePath;
      switch(bomba) {
        case 1: timePath = basePath + "/tempo_atual_sabao"; break;
        case 2: timePath = basePath + "/tempo_atual_floral"; break;
        case 3: timePath = basePath + "/tempo_atual_sport"; break;
      }
      if (Firebase.setString(fbdo, timePath, String(tempoSegundos))) {
        Serial.println("- Firebase atualizado com sucesso!");
      } else {
        Serial.println("- Erro ao atualizar Firebase!");
      }
      success = true;
    } else {
      Serial.printf("- Status: Falha (HTTP %d)\n", httpCode);
      Serial.println("- Erro ao consultar tempo!");
      success = false;
    }
    http.end();
  } else {
    Serial.println("- Status: Falha ao iniciar conexão HTTP");
    Serial.println("- Erro ao conectar com a dosadora!");
    success = false;
  }
  
  // Atualiza o status da dosadora no Firebase
  updateDosadoraStatus(id, success);
  
  Serial.println("----------------------------------------\n");
}

// Adicionar uma função dedicada para atualizar o status da dosadora
void updateDosadoraStatus(const char* id, bool isOnline) {
  if (!Firebase.ready() || strlen(storeCode) == 0) return;
  
  String statusPath = basePath + "/status/dosadoras/" + id;
  if (Firebase.setString(fbdo, statusPath, isOnline ? "online" : "offline")) {
    Serial.printf("- Status da dosadora %s atualizado no Firebase: %s\n", id, isOnline ? "online" : "offline");
  } else {
    Serial.printf("- Erro ao atualizar status da dosadora no Firebase: %s\n", fbdo.errorReason().c_str());
  }
}

// Função para consultar os tempos das bombas e retornar se a dosadora está online
bool consultarTemposBomba(const DosadoraConfig& dosadora) {
  Serial.printf("\nConsultando tempos para dosadora %s\n", dosadora.id);
  
  bool isOnline = false;
  
  // Tenta consultar o tempo da bomba de sabão (1)
  WiFiClient client;
  HTTPClient http;
  String url = "http://" + String(dosadora.ip) + dosadora.consultaEndpoints[0]; // Sabão
  
  http.setTimeout(HTTP_TIMEOUT);
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      int tempoMs = payload.toInt();
      int tempoSegundos = tempoMs / 1000;
      
      Serial.printf("- Tempo atual do Sabão: %d segundos\n", tempoSegundos);
      
      String basePath = dosadoraPath + "/" + dosadora.id;
      String timePath = basePath + "/tempo_atual_sabao";
      
      if (Firebase.setString(fbdo, timePath, String(tempoSegundos))) {
        Serial.println("- Firebase atualizado com sucesso para o tempo do Sabão!");
      } else {
        Serial.println("- Erro ao atualizar Firebase para o tempo do Sabão!");
      }
      
      isOnline = true;
    } else {
      Serial.printf("- Falha ao consultar tempo do Sabão (HTTP %d)\n", httpCode);
    }
    http.end();
  }
  
  delay(100);
  
  // Tenta consultar o tempo da bomba de Amaciante Floral (2)
  url = "http://" + String(dosadora.ip) + dosadora.consultaEndpoints[1]; // Floral
  
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      int tempoMs = payload.toInt();
      int tempoSegundos = tempoMs / 1000;
      
      Serial.printf("- Tempo atual do Amaciante Floral: %d segundos\n", tempoSegundos);
      
      String basePath = dosadoraPath + "/" + dosadora.id;
      String timePath = basePath + "/tempo_atual_floral";
      
      if (Firebase.setString(fbdo, timePath, String(tempoSegundos))) {
        Serial.println("- Firebase atualizado com sucesso para o tempo do Amaciante Floral!");
      } else {
        Serial.println("- Erro ao atualizar Firebase para o tempo do Amaciante Floral!");
      }
      
      isOnline = true;
    } else {
      Serial.printf("- Falha ao consultar tempo do Amaciante Floral (HTTP %d)\n", httpCode);
    }
    http.end();
  }
  
  delay(100);
  
  // Tenta consultar o tempo da bomba de Amaciante Sport (3)
  url = "http://" + String(dosadora.ip) + dosadora.consultaEndpoints[2]; // Sport
  
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      int tempoMs = payload.toInt();
      int tempoSegundos = tempoMs / 1000;
      
      Serial.printf("- Tempo atual do Amaciante Sport: %d segundos\n", tempoSegundos);
      
      String basePath = dosadoraPath + "/" + dosadora.id;
      String timePath = basePath + "/tempo_atual_sport";
      
      if (Firebase.setString(fbdo, timePath, String(tempoSegundos))) {
        Serial.println("- Firebase atualizado com sucesso para o tempo do Amaciante Sport!");
      } else {
        Serial.println("- Erro ao atualizar Firebase para o tempo do Amaciante Sport!");
      }
      
      isOnline = true;
    } else {
      Serial.printf("- Falha ao consultar tempo do Amaciante Sport (HTTP %d)\n", httpCode);
    }
    http.end();
  }
  
  Serial.println("Consulta de tempos concluída");
  return isOnline;
}

// Modificar a função checkDosadoraConfig para usar DosadoraConfig em vez de Device
void checkDosadoraConfig() {
  if (!Firebase.ready()) return;
  
  static unsigned long lastDosadoraCheck = 0;
  const unsigned long DOSADORA_CHECK_INTERVAL = 5000;  // Intervalo entre verificações (5 segundos)
  
  if (millis() - lastDosadoraCheck < DOSADORA_CHECK_INTERVAL) return;
  lastDosadoraCheck = millis();
  
  for (const DosadoraConfig& dosadora : dosadoras) {
    String basePath = dosadoraPath + "/" + dosadora.id;
    bool statusChanged = false;
    bool dosadoraOnline = false;
    
    // Verifica amaciante (bomba 2)
    if (Firebase.getInt(fbdo, basePath + "/amaciante")) {
      int value = fbdo.intData();
      if (value > 0) {
        String cmdType = value == 1 ? "simples" : "dupla";
        Serial.printf("\n>>> Comando de Dosagem para Dosadora %s <<<\n", dosadora.id);
        Serial.printf("- Tipo: Amaciante 2\n");
        Serial.printf("- Dosagem: %s\n", cmdType.c_str());
        Serial.printf("- IP: %s\n", dosadora.ip);
        
        // Determina o endpoint com base no tipo de dosagem
        const char* endpoint = value == 1 ? "/am02-1" : "/am02-2";
        Serial.printf("- Endpoint: %s\n", endpoint);
        
        WiFiClient client;
        HTTPClient http;
        String url = "http://" + String(dosadora.ip) + endpoint;
        
        http.setTimeout(HTTP_TIMEOUT);
        if (http.begin(client, url)) {
          int httpCode = http.GET();
          if (httpCode > 0) {
            Serial.printf("- Status: Sucesso (HTTP %d)\n", httpCode);
            Serial.printf("- Dosagem %s configurada com sucesso!\n", cmdType.c_str());
            statusChanged = true;
            dosadoraOnline = true;
          } else {
            Serial.printf("- Status: Falha (HTTP %d)\n", httpCode);
            Serial.printf("- Erro ao configurar dosagem!\n");
            statusChanged = true;
            dosadoraOnline = false;
          }
          http.end();
        } else {
          Serial.println("- Status: Falha ao iniciar conexão HTTP");
          Serial.println("- Erro ao conectar com a dosadora!");
          statusChanged = true;
          dosadoraOnline = false;
        }
        
        // Atualiza o status da dosadora no Firebase se houve mudança
        if (statusChanged) {
          updateDosadoraStatus(dosadora.id, dosadoraOnline);
        }
        
        // Reset o valor da dosagem
        Firebase.setInt(fbdo, basePath + "/amaciante", 0);
        
        Serial.println("----------------------------------------\n");
      }
    }
    
    // Verifica dosagem (bomba 1)
    if (Firebase.getInt(fbdo, basePath + "/dosagem")) {
      int value = fbdo.intData();
      if (value > 0) {
        String cmdType = value == 1 ? "simples" : "dupla";
        Serial.printf("\n>>> Comando de Dosagem para Dosadora %s <<<\n", dosadora.id);
        Serial.printf("- Tipo: Sabão 1\n");
        Serial.printf("- Dosagem: %s\n", cmdType.c_str());
        Serial.printf("- IP: %s\n", dosadora.ip);
        
        // Determina o endpoint com base no tipo de dosagem
        const char* endpoint = value == 1 ? "/sabao-1" : "/sabao-2";
        Serial.printf("- Endpoint: %s\n", endpoint);
        
        WiFiClient client;
        HTTPClient http;
        String url = "http://" + String(dosadora.ip) + endpoint;
        
        http.setTimeout(HTTP_TIMEOUT);
        if (http.begin(client, url)) {
          int httpCode = http.GET();
          if (httpCode > 0) {
            Serial.printf("- Status: Sucesso (HTTP %d)\n", httpCode);
            Serial.printf("- Dosagem %s configurada com sucesso!\n", cmdType.c_str());
            statusChanged = true;
            dosadoraOnline = true;
          } else {
            Serial.printf("- Status: Falha (HTTP %d)\n", httpCode);
            Serial.printf("- Erro ao configurar dosagem!\n");
            statusChanged = true;
            dosadoraOnline = false;
          }
          http.end();
        } else {
          Serial.println("- Status: Falha ao iniciar conexão HTTP");
          Serial.println("- Erro ao conectar com a dosadora!");
          statusChanged = true;
          dosadoraOnline = false;
        }
        
        // Atualiza o status da dosadora no Firebase se houve mudança
        if (statusChanged) {
          updateDosadoraStatus(dosadora.id, dosadoraOnline);
        }
        
        // Reset o valor da dosagem
        Firebase.setInt(fbdo, basePath + "/dosagem", 0);
        
        Serial.println("----------------------------------------\n");
      }
    }
    
    // Verificar consulta_tempo
    if (Firebase.getBool(fbdo, basePath + "/consulta_tempo")) {
      bool shouldConsult = fbdo.boolData();
      if (shouldConsult) {
        statusChanged = true;
        dosadoraOnline = consultarTemposBomba(dosadora);
        
        // Atualiza o status da dosadora no Firebase se houve mudança
        if (statusChanged) {
          updateDosadoraStatus(dosadora.id, dosadoraOnline);
        }
        
        // Reset o valor da consulta
        Firebase.setBool(fbdo, basePath + "/consulta_tempo", false);
      }
    }
  }
}

// Função para processar um dispositivo otimizada
void processDevice(const Device& device) {
  String path;
  if (strcmp(device.type, "lavadoras") == 0) {
    path = lavadorasPath + "/" + device.id;
  } else if (strcmp(device.type, "secadoras") == 0) {
    path = secadorasPath + "/" + device.id + device.endpoint;
  }
  
  // Verifica cache primeiro
  String cachedValue = getCachedValue(path);
  if (cachedValue == "true") {
    Serial.printf("Processando %s (do cache)\n", device.id);
    
    bool success = sendHttpRequest(device.ip, device.endpoint, device.numGets);
    
    // Atualiza status
    String deviceStatusPath;
    if (device.isAC) {
      deviceStatusPath = statusPath + "/ar_condicionado";
    } else if (strcmp(device.type, "secadoras") == 0) {
      char baseId[4];
      strncpy(baseId, device.id, 3);
      baseId[3] = '\0';
      deviceStatusPath = statusPath + "/secadoras/" + baseId;
    } else {
      deviceStatusPath = statusPath + "/lavadoras/" + device.id;
    }
    
    Firebase.setString(fbdo, deviceStatusPath, success ? "online" : "offline");
    Firebase.setBool(fbdo, path, false);
    addToCache(path, "false");
  } else if (Firebase.getBool(fbdo, path)) {
    if (fbdo.boolData()) {
      Serial.printf("Processando %s\n", device.id);
      
      bool success = sendHttpRequest(device.ip, device.endpoint, device.numGets);
      
      // Atualiza status
      String deviceStatusPath;
      if (device.isAC) {
        deviceStatusPath = statusPath + "/ar_condicionado";
      } else if (strcmp(device.type, "secadoras") == 0) {
        char baseId[4];
        strncpy(baseId, device.id, 3);
        baseId[3] = '\0';
        deviceStatusPath = statusPath + "/secadoras/" + baseId;
      } else {
        deviceStatusPath = statusPath + "/lavadoras/" + device.id;
      }
      
      Firebase.setString(fbdo, deviceStatusPath, success ? "online" : "offline");
      Firebase.setBool(fbdo, path, false);
      addToCache(path, "false");
    }
  }
}

// Função para processar as lavadoras
void processLavadoras() {
  for (const Device& lavadora : lavadoras) {
    String path = lavadorasPath + "/" + lavadora.id;
    
    if (Firebase.getBool(fbdo, path)) {
      if (fbdo.boolData()) {
        Serial.printf("\n>>> Processando lavadora %s <<<\n", lavadora.id);
        Serial.printf("- IP: %s\n", lavadora.ip);
        Serial.printf("- Endpoint: %s\n", lavadora.endpoint);
        
        // Envia o comando
        bool success = sendHttpRequest(lavadora.ip, lavadora.endpoint, 1);
        
        // Atualiza o status
        String lavadoraStatusPath = statusPath + "/lavadoras/" + lavadora.id;
        Firebase.setString(fbdo, lavadoraStatusPath, success ? "online" : "offline");
        
        // Se for o ID de uma dosadora, também atualiza o status da dosadora
        for (const DosadoraConfig& dosadora : dosadoras) {
          if (strcmp(lavadora.id, dosadora.id) == 0) {
            updateDosadoraStatus(dosadora.id, success);
            break;
          }
        }
        
        // Muda o nó para false após processar
        Firebase.setBool(fbdo, path, false);
        Serial.println("----------------------------------------\n");
      }
    }
  }
}

// Função para processar as secadoras
void processSecadoras() {
  for (const Device& secadora : secadoras) {
    String path = secadorasPath + "/" + secadora.id + secadora.endpoint;
    
    if (Firebase.getBool(fbdo, path)) {
      if (fbdo.boolData()) {
        Serial.printf("\n>>> Processando secadora %s%s <<<\n", secadora.id, secadora.endpoint);
        Serial.printf("- IP: %s\n", secadora.ip);
        Serial.printf("- Endpoint: lb\n");
        
        int numGets = 1;
        if (strcmp(secadora.endpoint, "_30") == 0) numGets = 2;
        else if (strcmp(secadora.endpoint, "_45") == 0) numGets = 3;
        
        // Envia o comando
        bool success = sendHttpRequest(secadora.ip, "lb", numGets);
        
        // Atualiza o status
        String secadoraStatusPath = statusPath + "/secadoras/" + secadora.id;
        Firebase.setString(fbdo, secadoraStatusPath, success ? "online" : "offline");
        
        // Se for o ID de uma dosadora, também atualiza o status da dosadora
        for (const DosadoraConfig& dosadora : dosadoras) {
          if (strcmp(secadora.id, dosadora.id) == 0) {
            updateDosadoraStatus(dosadora.id, success);
            break;
          }
        }
        
        // Muda o nó para false após processar
        Firebase.setBool(fbdo, path, false);
        Serial.println("----------------------------------------\n");
      }
    }
  }
}

// Função para processar o ar condicionado
void processAC() {
  for (const ACConfig& ac : acConfigs) {
    String path = arPath + "/" + ac.temp;
    
    if (Firebase.getBool(fbdo, path)) {
      if (fbdo.boolData()) {
        Serial.printf("Processando ar condicionado: %s graus\n", ac.temp);
        
        // Envia o GET para o endpoint
        WiFiClient client;
        HTTPClient http;
        String url = "http://10.1.40.110/" + String(ac.endpoint);
        
        http.setTimeout(HTTP_TIMEOUT);
        http.setReuse(true);
        
        bool success = false;
        int retryCount = 0;
        
        while (retryCount < MAX_RETRIES) {
          if (!http.begin(client, url)) {
            Serial.printf("Falha ao iniciar conexão HTTP para %s\n", url.c_str());
            retryCount++;
            delay(RETRY_DELAY);
            continue;
          }
          
          int httpCode = http.GET();
          if (httpCode > 0) {
            Serial.printf("GET %s - HTTP Response code: %d\n", url.c_str(), httpCode);
            success = true;
            break;
          } else {
            Serial.printf("GET %s - HTTP Request failed: %d (Tentativa %d/%d)\n", 
                       url.c_str(), httpCode, retryCount + 1, MAX_RETRIES);
            retryCount++;
            delay(RETRY_DELAY);
          }
          http.end();
        }
        
        // Atualiza o status
        String acStatusPath = statusPath + "/ar_condicionado";
        // Se o ar-condicionado estiver online, mantém o status como 'online' mesmo se o comando falhar
        if (Firebase.getString(fbdo, acStatusPath) && fbdo.stringData() == "online") {
          Firebase.setString(fbdo, acStatusPath, "online");
        } else {
          Firebase.setString(fbdo, acStatusPath, success ? "online" : "offline");
        }
        
        // Reseta o nó para false após processar
        Firebase.setBool(fbdo, path, false);
        Serial.printf("Ar condicionado %s processado e resetado para false\n", ac.temp);
      }
    }
  }
}

// Função para verificar o estado do botão
void checkButton() {
  static bool buttonPressed = false;
  static bool lastButtonState = false;
  bool currentButtonState = !digitalRead(BUTTON_PIN); // Inverte a leitura pois o botão está em pull-up
  
  // Debug - mostra o estado atual do botão
  if (currentButtonState != lastButtonState) {
    Serial.printf("DEBUG: Estado do botão mudou - Atual: %d, Anterior: %d\n", 
                  currentButtonState, lastButtonState);
    lastButtonState = currentButtonState;
    
    // Atualiza o status do totem no Firebase
    if (Firebase.ready()) {
      String buttonStatus = currentButtonState ? "OFF" : "ON";
      Firebase.setString(fbdo, buttonPath, buttonStatus);
      Serial.printf("Status do totem atualizado no Firebase: %s\n", buttonStatus.c_str());
    }
  }
  
  // Se o botão está pressionado e não estava antes
  if (currentButtonState && !buttonPressed) {
    buttonPressed = true;
    Serial.println("Botão pressionado - PC: OFF");
    
    // Atualiza o Firebase
    if (Firebase.ready()) {
      // Duas abordagens: atualizar a string "ON"/"OFF" e também um nó timestamp separado
      // para compatibilidade com o dashboard
      
      // Passo 1: Atualiza o valor string principal para compatibilidade antiga
      Firebase.setString(fbdo, pcStatusPath, "OFF");
      
      // Passo 2: Adiciona o timestamp para o dashboard com timestamp Unix atual
      unsigned long currentTime = getEpochTime();
      Firebase.setInt(fbdo, pcStatusPath + "/timestamp", currentTime * 1000); // Converter para milissegundos
      
      Serial.println("Firebase atualizado para OFF com timestamp");
    } else {
      Serial.println("Firebase não está pronto para atualização");
    }
    
    // Liga o LED
    digitalWrite(LED_BUILTIN, LOW);  // Liga o LED (é invertido no ESP8266)
    Serial.println("LED ligado");
  }
  // Se o botão está solto e estava pressionado antes
  else if (!currentButtonState && buttonPressed) {
    buttonPressed = false;
    Serial.println("Botão solto - PC: ON");
    
    // Atualiza o Firebase
    if (Firebase.ready()) {
      // Duas abordagens: atualizar a string "ON"/"OFF" e também um nó timestamp separado
      // para compatibilidade com o dashboard
      
      // Passo 1: Atualiza o valor string principal para compatibilidade antiga
      Firebase.setString(fbdo, pcStatusPath, "ON");
      
      // Passo 2: Adiciona o timestamp para o dashboard com timestamp Unix atual
      unsigned long currentTime = getEpochTime();
      Firebase.setInt(fbdo, pcStatusPath + "/timestamp", currentTime * 1000); // Converter para milissegundos
      
      Serial.println("Firebase atualizado para ON com timestamp");
    } else {
      Serial.println("Firebase não está pronto para atualização");
    }
    
    // Desliga o LED
    digitalWrite(LED_BUILTIN, HIGH); // Desliga o LED (é invertido no ESP8266)
    Serial.println("LED desligado");
  }
}

// Função para enviar comando de amaciante
void sendSoftenerCommand(const char* id, int softener) {
  const char* ip = nullptr;
  const char* softenerName;
  
  // Determina o IP baseado no ID da dosadora
  if (strcmp(id, "432") == 0) ip = "10.1.40.151";
  else if (strcmp(id, "543") == 0) ip = "10.1.40.152";
  else if (strcmp(id, "654") == 0) ip = "10.1.40.153";
  else return;
  
  const char* endpoint;
  switch(softener) {
    case 1: 
      endpoint = "/softener1"; 
      softenerName = "Amaciante 1";
      break;
    case 2: 
      endpoint = "/softener2"; 
      softenerName = "Amaciante 2";
      break;
    case 0: 
      endpoint = "/softener0"; 
      softenerName = "Nenhum Amaciante";
      break;
    default: return;
  }
  
  Serial.printf("\n>>> Seleção de Amaciante para Dosadora %s <<<\n", id);
  Serial.printf("- Tipo: %s\n", softenerName);
  Serial.printf("- IP: %s\n", ip);
  Serial.printf("- Endpoint: %s\n", endpoint);
  
  WiFiClient client;
  HTTPClient http;
  String url = "http://" + String(ip) + String(endpoint);
  bool success = false;
  
  http.setTimeout(HTTP_TIMEOUT);
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      Serial.printf("- Status: Sucesso (HTTP %d)\n", httpCode);
      Serial.printf("- Amaciante selecionado com sucesso!\n");
      success = true;
    } else {
      Serial.printf("- Status: Falha (HTTP %d)\n", httpCode);
      Serial.printf("- Erro ao selecionar amaciante!\n");
      success = false;
    }
    http.end();
  } else {
    Serial.println("- Status: Falha ao iniciar conexão HTTP");
    Serial.println("- Erro ao conectar com a dosadora!");
    success = false;
  }
  
  // Atualiza o status da dosadora no Firebase
  updateDosadoraStatus(id, success);
  
  Serial.println("- Seleção de Amaciante concluída");
  Serial.println("----------------------------------------\n");
}

// Função para enviar comando de dosagem
void sendDosagemCommand(const char* id, const char* dosagem) {
  const char* ip = nullptr;
  const char* dosagemName;
  
  // Determina o IP baseado no ID da dosadora
  if (strcmp(id, "432") == 0) ip = "10.1.40.151";
  else if (strcmp(id, "543") == 0) ip = "10.1.40.152";
  else if (strcmp(id, "654") == 0) ip = "10.1.40.153";
  else return;
  
  const char* endpoint;
  if (strcmp(dosagem, "simple") == 0) {
    endpoint = "/simple";
    dosagemName = "Simples";
  } else if (strcmp(dosagem, "double") == 0) {
    endpoint = "/double";
    dosagemName = "Dupla";
  } else {
    return;
  }
  
  Serial.printf("\n>>> Seleção de Dosagem para Dosadora %s <<<\n", id);
  Serial.printf("- Tipo: %s\n", dosagemName);
  Serial.printf("- IP: %s\n", ip);
  Serial.printf("- Endpoint: %s\n", endpoint);
  
  WiFiClient client;
  HTTPClient http;
  String url = "http://" + String(ip) + String(endpoint);
  bool success = false;
  
  http.setTimeout(HTTP_TIMEOUT);
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      Serial.printf("- Status: Sucesso (HTTP %d)\n", httpCode);
      Serial.printf("- Dosagem configurada com sucesso!\n");
      success = true;
    } else {
      Serial.printf("- Status: Falha (HTTP %d)\n", httpCode);
      Serial.printf("- Erro ao configurar dosagem!\n");
      success = false;
    }
    http.end();
  } else {
    Serial.println("- Status: Falha ao iniciar conexão HTTP");
    Serial.println("- Erro ao conectar com a dosadora!");
    success = false;
  }
  
  // Atualiza o status da dosadora no Firebase
  updateDosadoraStatus(id, success);
  
  Serial.println("- Seleção de Dosagem concluída");
  Serial.println("----------------------------------------\n");
}

// Função para verificar o status de um dispositivo
void checkDeviceStatus(const char* ip, const char* id, const char* type) {
  String url = "http://" + String(ip) + "/status";
  WiFiClient client;
  HTTPClient http;
  
  http.setTimeout(HTTP_TIMEOUT);
  if (http.begin(client, url)) {
    int httpCode = http.GET();
    String deviceStatusPath = statusPath + "/" + type + "/" + id;
    
    if (httpCode > 0) {
      Firebase.setString(fbdo, deviceStatusPath, "online");
      Serial.printf("%s %s está online\n", type, id);
    } else {
      Firebase.setString(fbdo, deviceStatusPath, "offline");
      Serial.printf("%s %s está offline\n", type, id);
    }
    
    http.end();
  }
}

// Função para salvar o código da loja na EEPROM
void saveStoreCode(const char* code) {
  // Primeiro byte é um flag indicando que a EEPROM foi inicializada
  EEPROM.write(0, EEPROM_INITIALIZED_FLAG);
  
  // Segundo byte é o comprimento do código da loja
  int codeLength = strlen(code);
  if (codeLength > STORE_CODE_MAX_LENGTH) {
    codeLength = STORE_CODE_MAX_LENGTH;
  }
  EEPROM.write(1, codeLength);
  
  // Escreve o código da loja
  for (int i = 0; i < codeLength; i++) {
    EEPROM.write(i + 2, code[i]);
  }
  
  EEPROM.commit();
  
  // Atualiza a variável global
  strncpy(storeCode, code, STORE_CODE_MAX_LENGTH);
  storeCode[STORE_CODE_MAX_LENGTH] = '\0';
  
  // Atualiza os caminhos do Firebase
  updateFirebasePaths();
}

// Função para ler o código da loja da EEPROM
bool loadStoreCode() {
  // Verifica se a EEPROM foi inicializada
  if (EEPROM.read(0) != EEPROM_INITIALIZED_FLAG) {
    Serial.println("EEPROM não inicializada, usando código vazio");
    storeCode[0] = '\0'; // Código vazio
    return false;
  }
  
  // Lê o comprimento do código da loja
  int codeLength = EEPROM.read(1);
  if (codeLength > STORE_CODE_MAX_LENGTH) {
    codeLength = STORE_CODE_MAX_LENGTH;
  }
  
  // Lê o código da loja
  for (int i = 0; i < codeLength; i++) {
    storeCode[i] = EEPROM.read(i + 2);
  }
  storeCode[codeLength] = '\0';
  
  Serial.println("Código da loja carregado da EEPROM: " + String(storeCode));
  if (strlen(storeCode) > 0) {
    updateFirebasePaths();
    return true;
  } else {
    Serial.println("Código da loja está vazio. Por favor, configure-o pela interface web.");
    return false;
  }
}

// Função para atualizar os caminhos do Firebase com base no código da loja
void updateFirebasePaths() {
  if (strlen(storeCode) > 0) {
    basePath = "/" + String(storeCode);
    lavadorasPath = basePath + "/lavadoras";
    secadorasPath = basePath + "/secadoras";
    arPath = basePath + "/ar_condicionado";
    statusPath = basePath + "/status";
    dosadoraPath = basePath + "/dosadora_01";
    pcStatusPath = basePath + "/pc_status";
    resetPath = basePath + "/reset";
    buttonPath = basePath + "/status_motherboard"; // Caminho para o status do totem (nome mantido para compatibilidade)
    
    Serial.println("Caminhos do Firebase atualizados:");
    Serial.println("- Base: " + basePath);
    Serial.println("- Lavadoras: " + lavadorasPath);
    Serial.println("- Secadoras: " + secadorasPath);
    Serial.println("- Ar Condicionado: " + arPath);
    Serial.println("- Status: " + statusPath);
    Serial.println("- Dosadora: " + dosadoraPath);
    Serial.println("- PC Status: " + pcStatusPath);
    Serial.println("- Reset: " + resetPath);
    Serial.println("- Status Totem: " + buttonPath);
  } else {
    // Inicializa com valores vazios para evitar problemas
    basePath = "";
    lavadorasPath = "";
    secadorasPath = "";
    arPath = "";
    statusPath = "";
    dosadoraPath = "";
    pcStatusPath = "";
    resetPath = "";
    buttonPath = "";
    
    Serial.println("Caminhos do Firebase inicializados como vazios - aguardando configuração");
  }
}

// Página HTML para configuração
const char CONFIG_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>Configuração do Controlador</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 500px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      text-align: center;
      margin-bottom: 20px;
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    }
    input {
      width: 100%;
      padding: 8px;
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .button {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 10px 15px;
      cursor: pointer;
      border-radius: 4px;
      width: 100%;
      font-size: 16px;
    }
    .button:hover {
      background: #45a049;
    }
    .status {
      text-align: center;
      margin-top: 20px;
      padding: 10px;
      border-radius: 4px;
    }
    .success {
      background-color: #d4edda;
      color: #155724;
    }
    .info {
      background-color: #d1ecf1;
      color: #0c5460;
    }
    .warning {
      background-color: #fff3cd;
      color: #856404;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Configuração do Controlador</h1>
    
    <div class="status %STATUS_CLASS%">
      %STATUS_MESSAGE%
    </div>
    
    <form action="/saveconfig" method="post">
      <div class="form-group">
        <label for="storecode">Código da Loja:</label>
        <input type="text" id="storecode" name="storecode" maxlength="10" placeholder="Ex: RN08" value="%STORECODE%">
      </div>
      
      <button type="submit" class="button">Salvar Configuração</button>
    </form>
    
    <div class="status" id="message">
      %MESSAGE%
    </div>
  </div>
</body>
</html>
)rawliteral";

// Função para substituir placeholders na página HTML
String processHtml(const String& var, const String& message = "") {
  String html = String(CONFIG_HTML);
  html.replace("%STORECODE%", storeCode);
  
  if (strlen(storeCode) > 0) {
    html.replace("%STATUS_CLASS%", "info");
    html.replace("%STATUS_MESSAGE%", "Código da Loja Atual: <strong>" + String(storeCode) + "</strong>");
  } else {
    html.replace("%STATUS_CLASS%", "warning");
    html.replace("%STATUS_MESSAGE%", "<strong>Nenhum código configurado!</strong> Por favor, configure o código da loja.");
  }
  
  html.replace("%MESSAGE%", message);
  return html;
}

// Handler para a página inicial
void handleRoot() {
  server.send(200, "text/html; charset=UTF-8", processHtml(""));
}

// Handler para a página de salvamento de configuração
void handleSaveConfig() {
  String newStoreCode = server.arg("storecode");
  newStoreCode.trim(); // Remove espaços em branco extras
  
  if (newStoreCode.length() > 0 && newStoreCode.length() <= STORE_CODE_MAX_LENGTH) {
    // Verifica se o código tem caracteres válidos
    bool isValid = true;
    for (size_t i = 0; i < newStoreCode.length(); i++) {
      char c = newStoreCode.charAt(i);
      if (!isalnum(c) && c != '_' && c != '-') {
        isValid = false;
        break;
      }
    }
    
    if (isValid) {
      saveStoreCode(newStoreCode.c_str());
      
      String message = "Configuração salva com sucesso! Código da loja alterado para: " + newStoreCode;
      server.send(200, "text/html; charset=UTF-8", processHtml("", message));
      
      // Reinicia o ESP após 3 segundos para aplicar as novas configurações
      delay(100);
      ESP.restart();
    } else {
      String message = "Erro: O código da loja contém caracteres inválidos. Use apenas letras, números, traços e sublinhados.";
      server.send(400, "text/html; charset=UTF-8", processHtml("", message));
    }
  } else {
    String message = "Erro: O código da loja deve ter entre 1 e " + String(STORE_CODE_MAX_LENGTH) + " caracteres.";
    server.send(400, "text/html; charset=UTF-8", processHtml("", message));
  }
}

// Adicionar a função de verificação periódica de status das dosadoras
void checkDosadorasStatus() {
  static unsigned long lastDosadoraStatusCheck = 0;
  const unsigned long DOSADORA_CHECK_INTERVAL = 300000; // 5 minutos
  
  if (millis() - lastDosadoraStatusCheck > DOSADORA_CHECK_INTERVAL) {
    lastDosadoraStatusCheck = millis();
    
    Serial.println("\n>>> Verificando status de todas as dosadoras <<<");
    
    for (const DosadoraConfig& dosadora : dosadoras) {
      WiFiClient client;
      HTTPClient http;
      String url = "http://" + String(dosadora.ip) + "/status";
      bool success = false;
      
      http.setTimeout(HTTP_TIMEOUT);
      if (http.begin(client, url)) {
        int httpCode = http.GET();
        if (httpCode > 0) {
          Serial.printf("- Dosadora %s está online (HTTP %d)\n", dosadora.id, httpCode);
          success = true;
        } else {
          Serial.printf("- Dosadora %s está offline (HTTP %d)\n", dosadora.id, httpCode);
          success = false;
        }
        http.end();
      } else {
        Serial.printf("- Dosadora %s está offline (falha ao conectar)\n", dosadora.id);
        success = false;
      }
      
      // Atualiza o status da dosadora no Firebase
      if (Firebase.ready()) {
        String statusPath = basePath + "/status/dosadoras/" + dosadora.id;
        if (Firebase.setString(fbdo, statusPath, success ? "online" : "offline")) {
          Serial.printf("- Status da dosadora %s atualizado no Firebase: %s\n", dosadora.id, success ? "online" : "offline");
        } else {
          Serial.printf("- Erro ao atualizar status da dosadora no Firebase: %s\n", fbdo.errorReason().c_str());
        }
      }
    }
    
    Serial.println("----------------------------------------\n");
  }
}

void setup() {
  Serial.begin(115200);
  delay(100); // Pequeno delay para estabilizar
  Serial.println("\nIniciando...");
  
  // Inicializa a EEPROM
  EEPROM.begin(EEPROM_SIZE);
  Serial.println("EEPROM inicializada");
  
  // Carrega o código da loja da EEPROM
  bool hasStoreCode = loadStoreCode();
  Serial.println(hasStoreCode ? "Código da loja carregado com sucesso" : "Nenhum código de loja configurado");
  
  // Configura os pinos
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(PIN_D5, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);  // Configura o pino do botão como entrada com pull-up
  
  // Debug: mostra a configuração dos pinos
  Serial.println("Configuração dos pinos:");
  Serial.printf("LED_BUILTIN: %d (OUTPUT)\n", LED_BUILTIN);
  Serial.printf("PIN_D5: %d (OUTPUT)\n", PIN_D5);
  Serial.printf("BUTTON_PIN: %d (INPUT_PULLUP)\n", BUTTON_PIN);
  
  // Inicializa os estados
  digitalWrite(LED_BUILTIN, HIGH); // LED inicialmente desligado
  digitalWrite(PIN_D5, LOW);
  Serial.println("Estados dos pinos inicializados");
  
  // Configuração de IP Fixo
  IPAddress staticIP(10, 1, 40, 100);
  IPAddress gateway(10, 1, 40, 1);
  IPAddress subnet(255, 255, 255, 0);
  IPAddress dns(10, 1, 40, 1);
  
  // Tentativa com try/catch para evitar crash
  Serial.println("Configurando IP fixo...");
  bool ipConfigSuccess = WiFi.config(staticIP, gateway, subnet, dns);
  if (!ipConfigSuccess) {
    Serial.println("FALHA: Erro ao configurar IP fixo");
  }
  
  Serial.println("Configuração de IP Fixo:");
  Serial.printf("IP: %s\n", staticIP.toString().c_str());
  Serial.printf("Gateway: %s\n", gateway.toString().c_str());
  Serial.printf("Subnet: %s\n", subnet.toString().c_str());
  Serial.printf("DNS: %s\n", dns.toString().c_str());
  
  // Configurações otimizadas do WiFi para ESP8266
  WiFi.setSleepMode(WIFI_NONE_SLEEP);  // Desativa o modo de economia de energia
  WiFi.setAutoReconnect(true);
  WiFi.hostname("ESP8266_Firebase"); // Define um hostname
  Serial.println("Configurações WiFi definidas");
  
  // Inicializa o webserver antes da conexão WiFi para permitir configuração mesmo sem internet
  server.on("/", handleRoot);
  server.on("/saveconfig", HTTP_POST, handleSaveConfig);
  server.begin();
  webServerStarted = true;
  Serial.println("WebServer iniciado");
  
  // Conecta-se ao Wi-Fi
  Serial.print("Conectando ao WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // Timeout para conexão WiFi
  unsigned long wifiStartTime = millis();
  const unsigned long WIFI_TIMEOUT = 20000; // 20 segundos
  
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(100);
    
    // Verifica timeout
    if (millis() - wifiStartTime > WIFI_TIMEOUT) {
      Serial.println("\nFALHA: Timeout na conexão WiFi");
      break;
    }
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi conectado!");
    Serial.print("Endereço IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nSem conexão WiFi. Operando apenas em modo local.");
  }
  
  // Inicializa o Firebase APENAS se tivermos um código de loja configurado
  if (hasStoreCode && WiFi.status() == WL_CONNECTED) {
    // Configurações de buffer otimizadas para o Firebase
    Serial.println("Configurando buffers do Firebase...");
    fbdo.setBSSLBufferSize(512, 2048);
    fbdo.setResponseSize(2048);
    
    Serial.println("Inicializando conexão com o Firebase...");
    config.database_url = DATABASE_URL;
    config.api_key = API_KEY;
    
    bool firebaseConnected = false;
    int retryCount = 0;
    const int maxRetries = 3;
    
    while (!firebaseConnected && retryCount < maxRetries) {
      retryCount++;
      Serial.printf("Tentativa de conexão ao Firebase %d/%d...\n", retryCount, maxRetries);
      
      if (Firebase.signUp(&config, &auth, "", "")) {
        Serial.println("Signup realizado com sucesso!");
        firebaseConnected = true;
      } else {
        String error = fbdo.errorReason();
        Serial.print("Falha no signup do Firebase: ");
        Serial.println(error);
        
        if (retryCount < maxRetries) {
          Serial.printf("Tentando novamente em 2 segundos...\n");
          delay(2000);
        }
      }
    }
    
    if (firebaseConnected) {
      Firebase.begin(&config, &auth);
      Firebase.reconnectWiFi(true);
      
      // Aguarda até 5 segundos pela conexão com o Firebase
      unsigned long fbStartTime = millis();
      const unsigned long FB_TIMEOUT = 5000; // 5 segundos
      
      Serial.print("Aguardando Firebase ficar pronto");
      while (!Firebase.ready() && (millis() - fbStartTime < FB_TIMEOUT)) {
        delay(100);
        Serial.print(".");
      }
      Serial.println();
      
      if (Firebase.ready()) {
        Serial.println("Firebase conectado!");
        
        // Inicializa o nó de status do PC somente se tiver código de loja
        if (strlen(storeCode) > 0) {
          // Verifica e tenta inicializar os nós básicos
          bool configOK = true;
          
          Serial.println("Inicializando nós básicos...");
          
          // Inicializa o PC status para o dashboard com timestamp
          if (!Firebase.setString(fbdo, pcStatusPath, "ON")) {
            Serial.println("Erro ao inicializar PC status: " + fbdo.errorReason());
            configOK = false;
          } else {
            // Configura NTP para obter o horário atual
            configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
            Serial.println("Aguardando sincronização NTP...");
            
            // Aguarda até 10 tentativas por sincronização NTP
            int ntpRetry = 0;
            while (time(nullptr) < 1600000000 && ntpRetry < 10) { // Verifica se recebeu um timestamp válido (após 2020)
              Serial.print(".");
              delay(500);
              ntpRetry++;
            }
            Serial.println();
            
            unsigned long currentTime = getEpochTime();
            if (currentTime > 1600000000) { // Timestamp válido após 2020
              // Armazena o timestamp em milissegundos como string para evitar problemas de precisão
              String timestampStr = String(currentTime * 1000LL);
              Serial.printf("Usando timestamp (ms) como string: %s\n", timestampStr.c_str());
              Firebase.setString(fbdo, pcStatusPath + "/timestamp", timestampStr);
              Serial.println("Status inicial do PC definido como ON com timestamp: " + String(currentTime));
            } else {
              // Mesmo sem NTP, ainda envia um timestamp mais recente que 1970
              String timestampStr = "1698796800000"; // 01/11/2023 00:00:00
              Firebase.setString(fbdo, pcStatusPath + "/timestamp", timestampStr);
              Serial.println("Sincronização NTP falhou, usando timestamp padrão");
            }
          }
          
          if (!Firebase.setInt(fbdo, resetPath, 0)) {
            Serial.println("Erro ao inicializar Reset: " + fbdo.errorReason());
            configOK = false;
          } else {
            Serial.println("Reset inicializado como 0 (espera)");
          }
          
          if (configOK) {
            // Inicializa todos os nós se a configuração básica funcionou
            Serial.println("Inicializando nós complementares...");
            
            // Inicializa os nós de configuração da dosadora para todas as lavadoras
            int numLavadoras = sizeof(lavadoras) / sizeof(lavadoras[0]);
            Serial.printf("Inicializando %d lavadoras...\n", numLavadoras);
            
            bool dosadoraOK = true;
            for (int i = 0; i < numLavadoras; i++) {
              const Device& lavadora = lavadoras[i];
              String basePath = dosadoraPath + "/" + lavadora.id;
              
              if (!Firebase.setInt(fbdo, basePath + "/amaciante", 0)) {
                Serial.printf("Erro ao inicializar dosadora %s: %s\n", lavadora.id, fbdo.errorReason().c_str());
                dosadoraOK = false;
                break; // Se uma falhar, para de tentar as outras
              }
              
              // Continua com as demais inicializações
              Firebase.setInt(fbdo, basePath + "/dosagem", 0);
              Firebase.setInt(fbdo, basePath + "/bomba", 0);
              
              // Inicializa os nós de tempo das bombas
              Firebase.setInt(fbdo, basePath + "/ajuste_tempo_sabao", 0);
              Firebase.setInt(fbdo, basePath + "/ajuste_tempo_floral", 0);
              Firebase.setInt(fbdo, basePath + "/ajuste_tempo_sport", 0);
              
              // Inicializa os nós de tempo atual
              Firebase.setString(fbdo, basePath + "/tempo_atual_sabao", "0");
              Firebase.setString(fbdo, basePath + "/tempo_atual_floral", "0");
              Firebase.setString(fbdo, basePath + "/tempo_atual_sport", "0");
              
              // Inicializa a flag de consulta de tempo
              Firebase.setBool(fbdo, basePath + "/consulta_tempo", false);
              
              Serial.printf("Dosadora configurada para lavadora %s\n", lavadora.id);
            }
            
            if (dosadoraOK) {
              // Inicializa os nós de status para as dosadoras
              Serial.println("Inicializando status das dosadoras...");
              for (const DosadoraConfig& dosadora : dosadoras) {
                String statusPath = basePath + "/status/dosadoras/" + dosadora.id;
                
                // Tenta verificar o status atual da dosadora
                WiFiClient client;
                HTTPClient http;
                String url = "http://" + String(dosadora.ip) + "/status";
                bool deviceOnline = false;
                
                http.setTimeout(HTTP_TIMEOUT);
                if (http.begin(client, url)) {
                  int httpCode = http.GET();
                  deviceOnline = (httpCode > 0);
                  http.end();
                }
                
                if (Firebase.setString(fbdo, statusPath, deviceOnline ? "online" : "offline")) {
                  Serial.printf("Status da dosadora %s inicializado como %s\n", 
                               dosadora.id, deviceOnline ? "online" : "offline");
                } else {
                  Serial.printf("Erro ao inicializar status da dosadora %s: %s\n", 
                               dosadora.id, fbdo.errorReason().c_str());
                }
              }
              
              // Continua com a inicialização dos outros nós
              // Inicializa todos os nós das lavadoras
              Serial.println("Inicializando todas as lavadoras...");
              for (int i = 0; i < numLavadoras; i++) {
                String path = lavadorasPath + "/" + lavadoras[i].id;
                if (Firebase.setBool(fbdo, path, false)) {
                  Serial.printf("Nó %s inicializado como false\n", path.c_str());
                } else {
                  Serial.printf("Erro ao inicializar %s: %s\n", path.c_str(), fbdo.errorReason().c_str());
                }
              }
              
              // Inicializa todos os nós das secadoras
              int numSecadoras = sizeof(secadoras) / sizeof(secadoras[0]);
              Serial.printf("Inicializando %d secadoras...\n", numSecadoras);
              for (int i = 0; i < numSecadoras; i++) {
                String path = secadorasPath + "/" + secadoras[i].id + secadoras[i].endpoint;
                if (Firebase.setBool(fbdo, path, false)) {
                  Serial.printf("Nó %s inicializado como false\n", path.c_str());
                } else {
                  Serial.printf("Erro ao inicializar %s: %s\n", path.c_str(), fbdo.errorReason().c_str());
                }
              }
              
              // Inicializa todos os nós do ar condicionado
              Serial.println("Inicializando nós do ar condicionado...");
              if (Firebase.setBool(fbdo, arPath + "/18", false)) {
                Serial.println("Nó ar condicionado/18 inicializado como false");
              }
              if (Firebase.setBool(fbdo, arPath + "/22", false)) {
                Serial.println("Nó ar condicionado/22 inicializado como false");
              }
              if (Firebase.setBool(fbdo, arPath + "/OFF", false)) {
                Serial.println("Nó ar condicionado/OFF inicializado como false");
              }
              
              Serial.println("Todos os nós inicializados com sucesso!");
            } else {
              Serial.println("Erro ao inicializar dosadoras, alguns nós podem não estar configurados");
            }
          }
        } else if (strlen(storeCode) == 0) {
          Serial.println("Iniciado sem código de loja. Aguardando configuração pela interface web.");
        }
      } else {
        Serial.println("Firebase não ficou pronto no timeout. Reiniciando automaticamente...");
        
        // Espera um curto período
        delay(2000);
        
        // Piscar o LED para indicar reinício
        for (int i = 0; i < 4; i++) {
          digitalWrite(LED_BUILTIN, i % 2 == 0 ? LOW : HIGH);
          delay(250);
        }
        
        // Reinicia o ESP
        ESP.restart();
        return;
      }
    } else {
      Serial.println("FALHA na conexão com o Firebase após " + String(maxRetries) + " tentativas.");
      Serial.println("Reiniciando automaticamente em 3 segundos...");
      
      // Sincronizar a EEPROM antes de reiniciar
      EEPROM.commit();
      
      // Piscar o LED para indicar reinício
      for (int i = 0; i < 6; i++) {
        digitalWrite(LED_BUILTIN, i % 2 == 0 ? LOW : HIGH);
        delay(500);
      }
      
      // Reinicia o ESP
      ESP.restart();
      return;
    }
  } else if (WiFi.status() == WL_CONNECTED) {
    // Se tem WiFi mas não tem código de loja configurado
    Serial.println("Firebase não inicializado. Aguardando configuração da loja via web.");
  } else {
    // Se não tem WiFi e não tem código de loja
    Serial.println("Sem conexão WiFi. Configure a loja quando a rede estiver disponível.");
  }
  
  Serial.println("Setup concluído!");
  
  // Inicializa o valor do botão no Firebase logo após a conexão
  if (hasStoreCode && WiFi.status() == WL_CONNECTED && Firebase.ready()) {
    bool initialButtonState = !digitalRead(BUTTON_PIN);
    String buttonStatus = initialButtonState ? "OFF" : "ON";
    Firebase.setString(fbdo, buttonPath, buttonStatus);
    Serial.printf("Estado inicial do totem no Firebase: %s\n", buttonStatus.c_str());
  }
}

void loop() {
  // Tentativa com watchdog reset para evitar loops infinitos
  loopCount++;
  
  // Monitoramento da conexão Firebase
  static unsigned long lastFirebaseCheck = 0;
  static int noConnectionCount = 0;
  
  // Verificar conexão com Firebase a cada 30 segundos
  if (millis() - lastFirebaseCheck > 30000) {
    lastFirebaseCheck = millis();
    if (strlen(storeCode) > 0 && WiFi.status() == WL_CONNECTED) {
      bool firebaseOK = Firebase.ready();
      if (!firebaseOK) {
        noConnectionCount++;
        Serial.printf("AVISO: Firebase não conectado (%d/5)\n", noConnectionCount);
        if (noConnectionCount >= 5) {
          Serial.println("Firebase sem conexão por muito tempo. Reiniciando...");
          ESP.restart();
        }
      } else {
        // Reset contador se conectado com sucesso
        if (noConnectionCount > 0) {
          Serial.println("Conexão com Firebase restaurada.");
        }
        noConnectionCount = 0;
      }
    }
  }
  
  // Processa as requisições do WebServer
  if (webServerStarted) {
    server.handleClient();
  }
  
  // Verifica se há um código de loja configurado
  if (strlen(storeCode) == 0) {
    // Pisca o LED para indicar que precisa de configuração
    if ((millis() / 500) % 2 == 0) {
      digitalWrite(LED_BUILTIN, LOW);  // Liga LED
    } else {
      digitalWrite(LED_BUILTIN, HIGH); // Desliga LED
    }
    delay(50);
    return; // Não executa o restante do loop até que um código seja configurado
  }

  // Verifica se o WiFi está conectado
  if (WiFi.status() != WL_CONNECTED) {
    // Pisca o LED rapidamente para indicar falta de conexão WiFi
    if ((millis() / 200) % 2 == 0) {
      digitalWrite(LED_BUILTIN, LOW);  // Liga LED
    } else {
      digitalWrite(LED_BUILTIN, HIGH); // Desliga LED
    }
    delay(100);
    return; // Não tenta operações com Firebase
  }
  
  // Verifica comando de reset primeiro
  if (Firebase.ready() && !isResetting) {
    if (Firebase.getInt(fbdo, resetPath)) {
      int resetValue = fbdo.intData();
      if (resetValue > 0) {
        Serial.printf("\n>>> Iniciando Reset %ds <<<\n", resetValue == 1 ? 1 : 13);
        isResetting = true;
        resetCommand = resetValue;
        resetStartTime = millis();
        digitalWrite(PIN_D5, HIGH);  // Ativa o relé
        Serial.println("- Relé ativado");
        return;
      }
    }
  }

  // Processa o reset se estiver ativo
  if (isResetting) {
    unsigned long elapsedTime = millis() - resetStartTime;
    unsigned long targetDuration = (resetCommand == 1) ? 1000 : 13000;
    
    // Pisca o LED durante o reset (a cada 100ms)
    if ((elapsedTime / 100) % 2 == 0) {
      digitalWrite(LED_BUILTIN, LOW);   // Liga LED
    } else {
      digitalWrite(LED_BUILTIN, HIGH);  // Desliga LED
    }
    
    if (elapsedTime >= targetDuration) {
      Serial.println("\n>>> Finalizando Reset <<<");
      digitalWrite(LED_BUILTIN, HIGH);  // Desliga LED
      digitalWrite(PIN_D5, LOW);        // Desliga relé
      Serial.println("- LED desligado");
      Serial.println("- Relé desativado");
      
      isResetting = false;
      resetCommand = 0;
      
      // Tentar atualizar o Firebase para informar que o reset foi concluído
      bool fbUpdated = false;
      int retryCount = 0;
      
      while (!fbUpdated && retryCount < 3) {
        if (Firebase.ready()) {
          if (Firebase.setInt(fbdo, resetPath, 0)) {
            Serial.println("- Firebase atualizado: Reset = 0");
            Serial.printf("- Duração total: %lu ms\n", elapsedTime);
            fbUpdated = true;
          } else {
            Serial.printf("- Tentativa %d: Erro ao atualizar Firebase após reset: %s\n", 
                        retryCount + 1, fbdo.errorReason().c_str());
            retryCount++;
            delay(500);  // Aguarda 500ms antes de tentar novamente
          }
        } else {
          Serial.printf("- Tentativa %d: Firebase não está pronto\n", retryCount + 1);
          retryCount++;
          delay(1000);  // Aguarda 1 segundo antes de tentar novamente
        }
      }
      
      if (!fbUpdated) {
        Serial.println("- Não foi possível atualizar o Firebase após todas as tentativas");
      }
      
      Serial.println("----------------------------------------\n");
      return;
    }
    return;
  }

  // Verifica status das dosadoras periodicamente
  checkDosadorasStatus();

  // Verifica TODAS as operações da dosadora primeiro
  if (Firebase.ready()) {
    for (const Device& lavadora : lavadoras) {
      String basePath = dosadoraPath + "/" + lavadora.id;
      bool commandExecuted = false;
      
      // 0. Verifica comando de amaciante (prioridade máxima)
      int currentAmaciante = 0;
      int currentDosagem = 0;  // Inicializa com 0
      bool hasAmaciante = false;
      bool hasDosagem = false;
      
      if (Firebase.getInt(fbdo, basePath + "/amaciante")) {
        currentAmaciante = fbdo.intData();
        hasAmaciante = true;
      }
      
      if (Firebase.getInt(fbdo, basePath + "/dosagem")) {
        currentDosagem = fbdo.intData();
        hasDosagem = true;
      }
      
      // Se temos tanto amaciante quanto dosagem configurados
      if (hasAmaciante && hasDosagem && currentAmaciante > 0 && currentAmaciante <= 2 && currentDosagem >= 1 && currentDosagem <= 2) {
        // Primeiro envia o comando de amaciante
        Serial.printf("\n>>> Selecionando amaciante %d para dosadora %s <<<\n", currentAmaciante, lavadora.id);
        sendSoftenerCommand(lavadora.id, currentAmaciante);
        
        // Depois envia a dosagem
        delay(200); // Pequena pausa entre comandos
        Serial.printf("\n>>> Enviando dosagem %s para dosadora %s <<<\n", 
                     currentDosagem == 1 ? "simples" : "dupla", lavadora.id);
        sendDosagemCommand(lavadora.id, currentDosagem == 1 ? "simple" : "double");
        
        // Reseta os valores no Firebase
        Firebase.setInt(fbdo, basePath + "/amaciante", 0);   // Reseta amaciante
        Firebase.setInt(fbdo, basePath + "/dosagem", 0);     // Reseta dosagem para 0
        commandExecuted = true;
      }
      
      // 1. Verifica comando de bomba
      if (!commandExecuted && Firebase.getInt(fbdo, basePath + "/bomba")) {
        int newBomba = fbdo.intData();
        if (newBomba >= 1 && newBomba <= 3) {
          sendDosadoraBomba(lavadora.id, newBomba);
          Firebase.setInt(fbdo, basePath + "/bomba", 0);
          commandExecuted = true;
        }
      }

      // 2. Verifica ajustes de tempo
      String timePathSabao = basePath + "/ajuste_tempo_sabao";
      String timePathFloral = basePath + "/ajuste_tempo_floral";
      String timePathSport = basePath + "/ajuste_tempo_sport";
      
      if (Firebase.getInt(fbdo, timePathSabao)) {
        int newTime = fbdo.intData();
        if (newTime > 0) {
          setDosadoraTime(lavadora.id, 1, newTime);
          Firebase.setInt(fbdo, timePathSabao, 0);
          Firebase.setBool(fbdo, basePath + "/consulta_tempo", true);
          commandExecuted = true;
        }
      }
      
      if (Firebase.getInt(fbdo, timePathFloral)) {
        int newTime = fbdo.intData();
        if (newTime > 0) {
          setDosadoraTime(lavadora.id, 2, newTime);
          Firebase.setInt(fbdo, timePathFloral, 0);
          Firebase.setBool(fbdo, basePath + "/consulta_tempo", true);
          commandExecuted = true;
        }
      }
      
      if (Firebase.getInt(fbdo, timePathSport)) {
        int newTime = fbdo.intData();
        if (newTime > 0) {
          setDosadoraTime(lavadora.id, 3, newTime);
          Firebase.setInt(fbdo, timePathSport, 0);
          Firebase.setBool(fbdo, basePath + "/consulta_tempo", true);
          commandExecuted = true;
        }
      }

      // 3. Verifica consulta de tempo
      if (Firebase.getBool(fbdo, basePath + "/consulta_tempo")) {
        if (fbdo.boolData()) {
          consultaDosadoraTime(lavadora.id, 1);
          consultaDosadoraTime(lavadora.id, 2);
          consultaDosadoraTime(lavadora.id, 3);
          Firebase.setBool(fbdo, basePath + "/consulta_tempo", false);
          commandExecuted = true;
        }
      }

      // Se executou algum comando, retorna imediatamente
      if (commandExecuted) {
        return;
      }
    }
  }

  // Processamento normal apenas quando não há comandos da dosadora
  if (millis() - lastCheck >= CHECK_INTERVAL) {
    lastCheck = millis();
    if (Firebase.ready() && WiFi.status() == WL_CONNECTED) {
      checkButton();
      processLavadoras();
      processSecadoras();
      processAC();
    }
  }
  
  // Só verifica o watchdog a cada 1000 loops para não sobrecarregar
  if (loopCount % 1000 == 0) {
    unsigned long currentTime = millis();
    if (lastLoopTime > 0 && currentTime - lastLoopTime > 10000) { // Se o loop ficar preso por mais de 10s
      Serial.printf("WARNING: Loop watchdog ativado! (%lu ms sem atualização)\n", currentTime - lastLoopTime);
    }
    lastLoopTime = currentTime;
  }
  
  // Atualiza o heartbeat a cada 30 segundos (reduzido de 60 segundos)
  if (millis() - lastHeartbeatUpdate > 30000) { // 30 segundos em vez de 60 segundos
    lastHeartbeatUpdate = millis();
    updateHeartbeat();
  }
}

// Função para atualizar o heartbeat
void updateHeartbeat() {
  // Verificar primeiro se o WiFi está conectado
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi desconectado, não é possível atualizar heartbeat");
    // Tentativa de reconexão ao WiFi - sem chamar setupWiFi()
    WiFi.reconnect();
    Serial.println("Tentando reconectar ao WiFi...");
    return;
  }
  
  // Verificar força do sinal WiFi (opcional)
  long rssi = WiFi.RSSI();
  Serial.printf("Força do sinal WiFi: %d dBm\n", rssi);
  
  if (Firebase.ready()) {
    // Atualiza o heartbeat com o timestamp atual em milissegundos
    if (Firebase.setInt(fbdo, String("/") + storeCode + "/heartbeat", millis())) {
      Serial.println("Heartbeat atualizado com sucesso");
      
      // Atualiza o timestamp do pc_status com o timestamp Unix atual
      unsigned long currentTime = getEpochTime();
      Serial.printf("Timestamp para Firebase: %lu (verificação)\n", currentTime);
      
      if (currentTime > 1600000000) { // Verifica se o timestamp é válido (após 2020)
        // Armazena o timestamp em milissegundos como string para evitar problemas de precisão
        String timestampStr = String(currentTime * 1000LL);
        Serial.printf("Armazenando timestamp (ms) como string: %s\n", timestampStr.c_str());
        
        if (Firebase.setString(fbdo, pcStatusPath + "/timestamp", timestampStr)) {
          Serial.println("PC status timestamp atualizado com sucesso: " + String(currentTime));
          
          // Verificar valor armazenado no Firebase
          if (Firebase.getString(fbdo, pcStatusPath + "/timestamp")) {
            Serial.printf("Timestamp armazenado no Firebase: %s\n", fbdo.stringData().c_str());
          }
        } else {
          Serial.println("Falha ao atualizar PC status timestamp: " + fbdo.errorReason());
        }
      } else {
        Serial.println("Timestamp NTP inválido: " + String(currentTime));
      }
    } else {
      Serial.println("Falha ao atualizar heartbeat: " + fbdo.errorReason());
    }
  } else {
    Serial.println("Firebase não está pronto para atualização");
  }
}

// Função para obter timestamp atual
unsigned long getEpochTime() {
  time_t now;
  time(&now);
  Serial.printf("NTP Timestamp: %lu (Unix epoch)\n", (unsigned long)now);
  
  // Verificar se o valor é razoável (após 2022)
  if (now < 1640995200) { // 1 Jan 2022
    Serial.println("Timestamp inválido, usando valor fixo recente");
    return 1698796800; // 1 Nov 2023 00:00:00 GMT
  }
  
  return now;
}