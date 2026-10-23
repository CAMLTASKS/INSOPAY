# PayHub Colombia - Pasarela de Pagos QR & Bre-B 🇨🇴

Plataforma unificada en **Node.js (Express)** y **Angular (TypeScript)** para generación, consulta, auditoría y simulación de cobros mediante **Código QR Dinámico** integrado con:
1. ⚡ **Factus Pay** (API oficial [pay-developers.factus.com.co](https://pay-developers.factus.com.co/) con red interoperable **Bre-B Colombia**)
2. 💸 **Cobro Directo Celular al `3503752816`** (Nequi, Bancolombia, Banco Caja Social - 0% comisión)
3. 🏦 **Openpay Colombia** (Comercio `mmihmqoqpbfcobqezvs6` - Redeban QR y Webcheckout)
4. 📡 **Monitor de Webhooks en Vivo** (Auditoría en tiempo real de eventos de pago)

---

## 🧭 Módulos Disponibles en la Barra de Navegación (Top Nav)

Al ingresar a **`http://localhost:3000`** encontrarás una barra superior con 4 módulos principales:

### 1. ⚡ Módulo Factus Pay (Bre-B Interoperable)
Con sub-pestañas para explotar **el 100% de las funcionalidades de la API de Factus**:
- **➕ Generar Recaudo (`POST /v1/collections`):**
  - Montos entre \$1.000 y \$12.100.000 COP con validación.
  - Generación de código QR inmediato en imagen PNG Base64.
  - Asignación de la **Llave Bre-B** oficial (ej: `@FCN3WVGF1E4AMS09CRMT`).
  - Botón para copiar la llave Bre-B y descargar la imagen QR.
  - Contador de vigencia (24 horas).
  - Polling en vivo cada 7 segundos para detectar cuando el cliente pague.
- **📋 Historial de Pagos (`GET /v1/collections`):**
  - Métricas en tiempo real: Total recaudos, Total en COP, Recaudos Pagados vs En Espera.
  - Tabla paginada con filtros por estado (`ready`, `started`, `paid`, `rejected`, `failed`).
  - Búsqueda instantánea por código de referencia o llave Bre-B.
  - Botón de acción **"👁️ Ver Detalle / QR"** con modal emergente para ver el QR en grande y sus datos técnicos.
- **🔍 Verificar Estado (`GET /v1/collections/:referenceCode`):**
  - Búsqueda directa por `reference_code`.
  - Muestra badges de estado en tiempo real, metadatos, QR asociado y JSON crudo devuelto por la API.
- **🧪 Simulador Sandbox:**
  - Pruebas oficiales según la documentación de Factus Pay Sandbox:
    - ✅ **Pago Exitoso** (`paid`)
    - ❌ **Saldo Insuficiente** (`tx_insufficient_funds` -> `rejected`)
    - ⚠️ **Error de Cuenta** (`tx_account_error` -> `failed`)
    - ⏳ **Tiempo de Espera Agotado** (`tx_timeout` -> `failed`)
  - Dispara automáticamente el evento de webhook correspondiente hacia tu backend.
- **⚙️ Diagnóstico & Conexión:**
  - Test de latencia y ping hacia la API de Factus (`https://pay-api-sandbox.factus.com.co`).
  - Verificación del estado del Token JWT Bearer.
  - URL lista para registrar en tu panel de Factus como Webhook.

---

### 2. 💸 Módulo Directo Celular (3503752816)
Genera códigos QR bajo el estándar internacional **EMVCo Redeban Colombia** para transferencias directas de persona a persona (P2P) al número **3503752816**:
- **Banco Caja Social** (código ACH `1032` / Bre-B)
- **Nequi** (+57)
- **Bancolombia**
- **Daviplata**, **BBVA**, **Banco de Bogotá**, etc.
- Sin cobro de comisiones de intermediarios.

---

### 3. 🏦 Módulo Openpay Colombia
Integración con las credenciales de Sandbox Openpay (`mmihmqoqpbfcobqezvs6`):
- **QR Bancario EMVCo:** Para escanear en apps financieras bajo la red Redeban.
- **Webcheckout Oficial:** Genera enlace seguro para pagos con PSE o tarjetas de débito/crédito.

---

### 4. 📡 Monitor de Webhooks en Vivo
Panel de auditoría que registra en tiempo real todos los eventos recibidos en tu servidor, mostrando ID, timestamp, evento, referencia, monto, estado y visor de payload JSON.

---

## 🛠️ Endpoints REST del Backend (Node.js / Express)

### Factus Pay:
| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| **POST** | `/api/factus/generate` | Generar nuevo recaudo y código QR |
| **GET** | `/api/factus/collections` | Listar recaudos con paginación (`?page=1&status=ready&reference_code=...`) |
| **GET** | `/api/factus/status/:referenceCode` | Consultar estado y detalle de un recaudo |
| **POST** | `/api/factus/simulate` | Simular escenarios (`paid`, `tx_insufficient_funds`, etc.) |
| **GET** | `/api/factus/test-connection` | Probar ping y estado del token de autenticación |
| **GET** | `/api/factus/webhooks` | Obtener historial de webhooks recibidos |
| **DELETE** | `/api/factus/webhooks` | Limpiar historial de webhooks |
| **POST** | `/api/factus/webhook` | Endpoint receptor oficial de Factus Pay |

### QR Directo y Openpay:
| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| **POST** | `/api/qr/generate` | Generar QR (Directo Celular u Openpay) |
| **GET** | `/api/qr/charge/:id` | Consultar estado en Openpay |
| **POST** | `/api/qr/webhook` | Webhook de Openpay |

---

## 🅰️ Componente y Servicio Angular Listos para Usar

En la carpeta [`angular/`](file:///c:/Users/carlosamaldonadol/Documents/qr/angular/) dispones de la solución completa en TypeScript:

1. **Modelos TypeScript:** [`angular/factus-pay.models.ts`](file:///c:/Users/carlosamaldonadol/Documents/qr/angular/factus-pay.models.ts)
2. **Servicio Injectable:** [`angular/factus-pay.service.ts`](file:///c:/Users/carlosamaldonadol/Documents/qr/angular/factus-pay.service.ts)
3. **Componente Completo (Standalone):**
   - [`angular/factus-module/factus-pay.component.ts`](file:///c:/Users/carlosamaldonadol/Documents/qr/angular/factus-module/factus-pay.component.ts)
   - [`angular/factus-module/factus-pay.component.html`](file:///c:/Users/carlosamaldonadol/Documents/qr/angular/factus-module/factus-pay.component.html)
   - [`angular/factus-module/factus-pay.component.css`](file:///c:/Users/carlosamaldonadol/Documents/qr/angular/factus-module/factus-pay.component.css)

### Ejemplo de uso del servicio en Angular:
```typescript
import { Component } from '@angular/core';
import { FactusPayService } from './factus-pay.service';

@Component({
  selector: 'app-pago-breb',
  template: `
    <button (click)="crearCobro(25000)">Cobrar $25.000 con Factus Pay</button>
    <div *ngIf="qr">
      <img [src]="qr" width="280" height="280" alt="QR Bre-B" />
      <p>Llave Bre-B: <strong>{{ brebKey }}</strong></p>
      <p>Estado: {{ estado }}</p>
    </div>
  `
})
export class PagoBrebComponent {
  qr?: string;
  brebKey?: string;
  estado: string = 'ready';

  constructor(private factus: FactusPayService) {}

  crearCobro(monto: number) {
    this.factus.createCollection({ amount: monto, description: 'Servicio Conecta Hogar' })
      .subscribe(res => {
        this.qr = res.data.qr;
        this.brebKey = res.data.breb_key;
        this.estado = res.data.status;

        // Polling automático hasta que pase a paid/failed
        this.factus.pollStatusUntilFinished(res.data.reference_code, 7000)
          .subscribe(actualizacion => {
            this.estado = actualizacion.status;
            if (actualizacion.status === 'paid') {
              alert('¡Pago completado con éxito!');
            }
          });
      });
  }
}
```

---

## 💻 Comandos de Consola (CLI)

```bash
# Probar Factus Pay con $35.000 COP
npm run generate-factus 35000

# Probar Openpay con $25.000 COP
npm run generate-qr 25000

# Iniciar servidor
npm start
```
