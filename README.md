# Servicio de Pagos con Código QR - Openpay Colombia 🇨🇴

Servicio completo en **Node.js (Express)** y **Angular (TypeScript)** para la generación, visualización y consulta de cargos con **Código QR Dinámico** integrado con la pasarela **Openpay Colombia** (Redeban).

---

## 📋 Credenciales y Configuración (Sandbox)

El servicio ya viene preconfigurado con tus credenciales de Openpay:

- **Merchant ID:** `mmihmqoqpbfcobqezvs6`
- **Llave Secreta:** `sk_d6d93ebea13e44f093f1eb75179161e7`
- **Llave Pública:** `pk_1ea642830c114f56b04a353f5ab94e14`
- **URL Base:** `https://sandbox-api.openpay.co/v1/`
- **Moneda:** `COP` (Pesos Colombianos)

> ⚠️ **Importante de Seguridad (Openpay):**
> La generación de cargos QR requiere la **Llave Privada / Secreta** (`sk_...`) con autenticación HTTP Basic. Openpay **prohíbe estrictamente** el uso de la llave secreta desde el navegador/frontend JavaScript (Error `1010 Forbidden`). Por eso la generación se procesa a través del servicio seguro de **Node.js**, y el frontend (Angular o Web) consume este servicio.

---

## 🚀 Inicio Rápido

### 1. Instalar dependencias
```bash
npm install
```

### 2. Iniciar el servidor
```bash
npm start
```
El servidor arrancará en: **`http://localhost:3000`**

### 3. Probar la interfaz visual interactiva
Abre en tu navegador:
👉 **[http://localhost:3000](http://localhost:3000)**

Podrás:
1. Digitar cualquier valor a cobrar (ej: `$25.000 COP`, `$50.000 COP`).
2. Generar el código QR dinámico al instante.
3. Ver el **temporizador regresivo reglamentario de 10 minutos** con barra de progreso.
4. Ver el sondeo automático de estado cada 30 segundos (`charge_pending`, `completed`, `cancelled`, `failed`).
5. Simular el pago exitoso en Sandbox con un clic.

---

## 💻 Prueba desde Terminal (CLI)

Puedes generar un código QR y verificar la respuesta de Openpay directamente desde la línea de comandos sin abrir el navegador:

```bash
# Probar con valor por defecto
npm run test

# O pasar cualquier valor personalizado como argumento (ej: $45.000 COP):
npm run generate-qr 45000
```

---

## 📡 Endpoints de la API Node.js

### 1. Generar Código QR de Pago
- **Ruta:** `POST /api/qr/generate`
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
  "amount": 50000,
  "description": "Pago de pedido #1042",
  "order_id": "ORD-12345",
  "customer": {
    "name": "Juan",
    "last_name": "Perez",
    "email": "juan.perez@ejemplo.com",
    "phone_number": "3001234567"
  }
}
```

- **Respuesta (201 Created):**
```json
{
  "success": true,
  "message": "Código QR generado satisfactoriamente",
  "is_simulation": false,
  "charge": {
    "id": "trrftc5hz1mshp6yygwj",
    "amount": 50000,
    "currency": "COP",
    "status": "charge_pending",
    "creation_date": "2026-10-22T15:20:00-05:00",
    "order_id": "ORD-12345",
    "payment_method": {
      "type": "qr",
      "barcode_base64": "iVBORw0KGgoAAAANSUhEUgAAAYEAAAGBAQAAAACoIjCJAAAH...",
      "qr_type": "dynamic"
    },
    "timer": {
      "duration_minutes": 10,
      "expires_at": "2026-10-22T15:30:00-05:00",
      "expires_in_seconds": 600,
      "must_refresh": true
    }
  }
}
```

#### Para mostrar la imagen en HTML:
```html
<img width="300" height="300" src="data:image/png;base64,{charge.payment_method.barcode_base64}">
```

---

### 2. Consultar Estado de la Transacción QR
- **Ruta:** `GET /api/qr/status/:transactionId`
- **Descripción:** Consulta a Openpay el estado del cargo. Según la documentación oficial de Openpay, se debe invocar en intervalos no menores a 30 segundos.
- **Valores posibles de `status`:**
  - `charge_pending`: Transacción activa esperando que el cliente pague.
  - `completed`: Transacción pagada exitosamente.
  - `cancelled`: Transacción expirada (se cumplieron los 10 minutos sin pago) o cancelada.
  - `failed`: Transacción fallida.

---

### 3. Simular Pago Exitoso (Ambiente Sandbox)
- **Ruta:** `POST /api/qr/simulate-payment/:transactionId`
- **Descripción:** Pasa la transacción a estado `completed` para pruebas locales.

---

## 🅰️ Integración en Angular

En la carpeta [`angular/`](./angular/) se incluye el servicio completo y un componente listo para usar:

- [`angular/openpay-qr.service.ts`](./angular/openpay-qr.service.ts): Servicio `@Injectable` con `generateQr()`, `checkStatus()`, y `pollStatusUntilFinished()`.
- [`angular/openpay-qr.models.ts`](./angular/openpay-qr.models.ts): Interfaces TypeScript completas.
- [`angular/qr-payment.component.ts`](./angular/qr-payment.component.ts): Componente Standalone con timer de 10 min y visualización.

### Ejemplo de uso rápido en Angular:
```typescript
import { Component } from '@angular/core';
import { OpenpayQrService } from './openpay-qr.service';

@Component({
  selector: 'app-checkout',
  template: `
    <button (click)="crearCobro(30000)">Cobrar $30.000 COP con QR</button>
    <div *ngIf="qrImage">
      <img [src]="'data:image/png;base64,' + qrImage" width="280" height="280" />
    </div>
  `
})
export class CheckoutComponent {
  qrImage: string | null = null;

  constructor(private qrService: OpenpayQrService) {}

  crearCobro(monto: number) {
    this.qrService.generateQuickQr(monto, 'Compra express').subscribe({
      next: (res) => {
        if (res.success && res.charge) {
          this.qrImage = res.charge.payment_method.barcode_base64;
          
          // Escuchar el pago automáticamente cada 30s
          this.qrService.pollStatusUntilFinished(res.charge.id).subscribe((charge) => {
            if (charge.status === 'completed') {
              alert('¡Pago recibido con éxito!');
            }
          });
        }
      }
    });
  }
}
```

---

## ⚙️ Validación Técnica y Reglas de Openpay Colombia

1. **Moneda y Monto:**
   - Moneda: `COP`.
   - El monto debe ser un entero positivo mayor a 0 (ej. `50000` para $50.000 COP). **No debe contener decimales**.
2. **Temporizador de 10 Minutos:**
   - La normativa de certificación técnica de Openpay exige que el comercio controle la expiración del QR cada 10 minutos. El servicio incluye este temporizador tanto en el backend como en las interfaces visuales.
3. **Parámetro "Comercio QR" en Sandbox:**
   - La API de Openpay Sandbox retornará el error `422 (1003): "El comercio no tiene configurado el parametro de comercio QR"` si la cuenta aún no tiene habilitado el módulo QR con Redeban por parte de Openpay.
   - Este proyecto incluye **modo de contingencia / simulación automática** (`ENABLE_QR_FALLBACK_SIMULATION=true` en `.env`), lo que te permite probar toda la experiencia, generar imágenes QR base64 reales y consultar estados mientras solicitas a soporte de Openpay (`soporte@openpay.co`) la activación del flag en tu comercio. En cuanto soporte lo active, el servicio consumirá automáticamente la pasarela de Openpay sin requerir ningún cambio de código.
