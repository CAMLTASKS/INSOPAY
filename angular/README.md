# Integración Angular - Códigos QR de Pago con Openpay Colombia

Este módulo provee el servicio `@Injectable` y un componente Standalone listo para usar en aplicaciones Angular (v14 hasta v19+).

## 📁 Archivos incluidos

- `openpay-qr.models.ts`: Interfaces y DTOs (`CreateQrRequest`, `OpenpayChargeResponse`, `TransactionStatus`, etc.).
- `openpay-qr.service.ts`: Servicio con métodos `generateQr()`, `generateQuickQr()`, `checkStatus()`, y `pollStatusUntilFinished()`.
- `qr-payment.component.ts`: Componente Standalone listo para importar.
- `qr-payment.component.html`: Plantilla con display del QR, temporizador reglamentario de 10 minutos y actualización de estado.
- `qr-payment.component.css`: Estilos modernos y adaptables.

---

## 🚀 Cómo usar en tu proyecto Angular

### 1. Configurar `HttpClient`

En tu `main.ts` (Angular 15+ standalone):
```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient()
  ]
});
```

O si usas `AppModule` tradicional:
```typescript
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  imports: [HttpClientModule, ...]
})
export class AppModule {}
```

---

### 2. Uso directo del Servicio en cualquier componente o checkout

```typescript
import { Component } from '@angular/core';
import { OpenpayQrService } from './openpay-qr.service';

@Component({
  selector: 'app-checkout',
  template: `
    <button (click)="cobrar(50000)">Generar QR por $50.000 COP</button>
    <div *ngIf="qrBase64">
      <img [src]="'data:image/png;base64,' + qrBase64" width="300" height="300" />
    </div>
  `
})
export class CheckoutComponent {
  qrBase64: string | null = null;

  constructor(private qrService: OpenpayQrService) {}

  cobrar(monto: number) {
    this.qrService.generateQuickQr(monto, 'Pago de suscripción').subscribe({
      next: (res) => {
        if (res.success && res.charge) {
          // Extraer la imagen base64
          this.qrBase64 = res.charge.payment_method.barcode_base64;
          
          // Iniciar sondeo automático cada 30 segundos
          this.qrService.pollStatusUntilFinished(res.charge.id).subscribe((charge) => {
            console.log('Estado actual:', charge.status);
            if (charge.status === 'completed') {
              alert('¡Pago recibido con éxito!');
            }
          });
        }
      },
      error: (err) => console.error(err)
    });
  }
}
```

---

### 3. O usar el Componente Standalone prefabricado

```html
<!-- En tu plantilla HTML -->
<app-qr-payment 
  [amount]="75000" 
  [description]="'Compra en tienda'"
  (paymentCompleted)="onPagoExitoso($event)"
  (paymentExpired)="onQrExpirado()">
</app-qr-payment>
```

```typescript
// En tu componente padre
import { QrPaymentComponent } from './qr-payment.component';

@Component({
  standalone: true,
  imports: [QrPaymentComponent],
  template: `...`
})
export class MiVistaComponent {
  onPagoExitoso(charge: any) {
    console.log('Pago completado:', charge.id);
  }

  onQrExpirado() {
    console.log('El tiempo de 10 minutos se cumplió sin pago.');
  }
}
```
