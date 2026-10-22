import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { OpenpayQrService } from './openpay-qr.service';
import { OpenpayChargeResponse, CustomerDto } from './openpay-qr.models';

@Component({
  selector: 'app-qr-payment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './qr-payment.component.html',
  styleUrls: ['./qr-payment.component.css']
})
export class QrPaymentComponent implements OnInit, OnDestroy {
  @Input() amount: number = 25000;
  @Input() description: string = 'Pago de servicio / producto';
  @Input() customer: CustomerDto = {
    name: 'Carlos',
    last_name: 'Maldonado',
    email: 'carlos@test.co',
    phone_number: '3001234567'
  };

  @Output() paymentCompleted = new EventEmitter<OpenpayChargeResponse>();
  @Output() paymentExpired = new EventEmitter<void>();

  charge: OpenpayChargeResponse | null = null;
  isLoading: boolean = false;
  errorMessage: string | null = null;

  // Temporizador de 10 minutos (Regla Openpay)
  remainingSeconds: number = 600;
  timerString: string = '10:00';
  progressPercent: number = 100;
  private timerSub?: any;
  private pollingSub?: Subscription;

  constructor(private qrService: OpenpayQrService) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.cleanTimers();
  }

  generateQr(): void {
    if (!this.amount || this.amount < 1000) {
      this.errorMessage = 'El monto debe ser un entero mayor o igual a $1.000 COP';
      return;
    }

    this.cleanTimers();
    this.isLoading = true;
    this.errorMessage = null;

    this.qrService.generateQr({
      amount: Math.round(this.amount),
      description: this.description,
      customer: this.customer
    }).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success && res.charge) {
          this.charge = res.charge;
          this.startCountdown();
          this.startPolling(res.charge.id);
        } else {
          this.errorMessage = res.error || 'No se pudo generar el QR';
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.error || err.message || 'Error de conexión con el servicio QR';
      }
    });
  }

  private startCountdown(): void {
    this.remainingSeconds = 600; // 10 min
    this.updateTimerString();

    this.timerSub = setInterval(() => {
      this.remainingSeconds--;
      this.updateTimerString();

      if (this.remainingSeconds <= 0) {
        this.cleanTimers();
        if (this.charge) {
          this.charge.status = 'cancelled';
        }
        this.paymentExpired.emit();
      }
    }, 1000);
  }

  private updateTimerString(): void {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    this.timerString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    this.progressPercent = (this.remainingSeconds / 600) * 100;
  }

  private startPolling(transactionId: string): void {
    this.pollingSub = this.qrService.pollStatusUntilFinished(transactionId, 30000).subscribe({
      next: (updatedCharge) => {
        if (this.charge) {
          this.charge.status = updatedCharge.status;
        }
        if (updatedCharge.status === 'completed') {
          this.cleanTimers();
          this.paymentCompleted.emit(updatedCharge);
        }
      },
      error: (err) => console.warn('Error polling status:', err)
    });
  }

  checkStatusManually(): void {
    if (!this.charge) return;
    this.qrService.checkStatus(this.charge.id).subscribe({
      next: (res) => {
        if (res.charge) {
          this.charge = res.charge;
          if (res.charge.status === 'completed') {
            this.cleanTimers();
            this.paymentCompleted.emit(res.charge);
          }
        }
      }
    });
  }

  simulateSuccess(): void {
    if (!this.charge) return;
    this.qrService.simulatePayment(this.charge.id).subscribe({
      next: (res) => {
        if (this.charge) {
          this.charge.status = 'completed';
        }
        this.cleanTimers();
        this.paymentCompleted.emit(this.charge!);
      }
    });
  }

  private cleanTimers(): void {
    if (this.timerSub) {
      clearInterval(this.timerSub);
      this.timerSub = null;
    }
    if (this.pollingSub) {
      this.pollingSub.unsubscribe();
      this.pollingSub = undefined;
    }
  }
}
