import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FactusPayService } from '../factus-pay.service';
import { 
  FactusCollectionData, 
  FactusCollectionStatus, 
  FactusSimulationScenario, 
  FactusWebhookLogEntry,
  FactusTestConnectionResponse
} from '../factus-pay.models';

@Component({
  selector: 'app-factus-pay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './factus-pay.component.html',
  styleUrls: ['./factus-pay.component.css']
})
export class FactusPayComponent implements OnInit, OnDestroy {
  // Navegación interna del módulo Factus
  activeSubTab: 'create' | 'list' | 'verify' | 'simulate' | 'diagnostics' = 'create';

  // 1. Formulario Nuevo Recaudo
  amount: number = 25000;
  customReference: string = '';
  description: string = 'Pago de servicio';
  loadingGenerate: boolean = false;
  createdCollection?: FactusCollectionData;
  pollingSubscription?: Subscription;

  // 2. Historial de Recaudos (Listado)
  collections: FactusCollectionData[] = [];
  filterStatus: FactusCollectionStatus | 'all' = 'all';
  searchQuery: string = '';
  currentPage: number = 1;
  totalPages: number = 1;
  totalCollections: number = 0;
  loadingList: boolean = false;
  selectedCollectionDetail?: FactusCollectionData;

  // 3. Verificador de Estado
  verifyReferenceCode: string = '';
  verifiedResult?: FactusCollectionData;
  loadingVerify: boolean = false;

  // 4. Simulador Sandbox
  simulateReferenceCode: string = '';
  simulateScenario: FactusSimulationScenario = 'paid';
  simulateAmount: number = 25000;
  simulationResult: any = null;
  loadingSimulate: boolean = false;

  // 5. Diagnóstico & Webhooks
  diagnosticData?: FactusTestConnectionResponse;
  loadingDiagnostic: boolean = false;
  webhookLogs: FactusWebhookLogEntry[] = [];
  loadingWebhooks: boolean = false;

  constructor(private factusPay: FactusPayService) {}

  ngOnInit(): void {
    this.testApiConnection();
    this.loadCollections();
    this.loadWebhookLogs();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  // --- 1. Generar Recaudo ---
  generateQr(): void {
    if (!this.amount || this.amount < 1000 || this.amount > 12100000) {
      alert('El monto debe estar entre $1.000 y $12.100.000 COP');
      return;
    }

    this.loadingGenerate = true;
    this.stopPolling();

    this.factusPay.createCollection({
      amount: this.amount,
      reference_code: this.customReference.trim() || undefined,
      description: this.description.trim() || undefined
    }).subscribe({
      next: (res) => {
        this.loadingGenerate = false;
        this.createdCollection = res.data;
        this.simulateReferenceCode = res.data.reference_code;
        this.simulateAmount = res.data.amount;
        
        // Iniciar polling para monitorear el pago
        this.startPolling(res.data.reference_code);
        // Actualizar listado en segundo plano
        this.loadCollections();
      },
      error: (err) => {
        this.loadingGenerate = false;
        alert(`Error generando QR Factus: ${err.error?.error || err.message}`);
      }
    });
  }

  startPolling(refCode: string): void {
    this.stopPolling();
    this.pollingSubscription = this.factusPay.pollStatusUntilFinished(refCode, 7000).subscribe({
      next: (data) => {
        if (this.createdCollection && this.createdCollection.reference_code === refCode) {
          this.createdCollection.status = data.status;
        }
        if (data.status === 'paid') {
          alert(`🎉 ¡Pago confirmado en Factus Pay para el recaudo ${refCode}!`);
          this.loadCollections();
        }
      }
    });
  }

  stopPolling(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = undefined;
    }
  }

  // --- 2. Historial de Recaudos ---
  loadCollections(page: number = 1): void {
    this.loadingList = true;
    this.currentPage = page;
    this.factusPay.listCollections({
      page,
      status: this.filterStatus,
      reference_code: this.searchQuery.trim() || undefined
    }).subscribe({
      next: (res) => {
        this.loadingList = false;
        this.collections = res.data || [];
        this.currentPage = res.meta?.current_page || 1;
        this.totalPages = res.meta?.last_page || 1;
        this.totalCollections = res.meta?.total || this.collections.length;
      },
      error: (err) => {
        this.loadingList = false;
        console.error('Error cargando recaudos:', err);
      }
    });
  }

  viewCollectionModal(collection: FactusCollectionData): void {
    this.selectedCollectionDetail = collection;
    // Si no tiene la imagen QR, la consultamos en detalle
    if (!collection.qr) {
      this.factusPay.checkStatus(collection.reference_code).subscribe({
        next: (res) => {
          this.selectedCollectionDetail = res.data;
        }
      });
    }
  }

  closeModal(): void {
    this.selectedCollectionDetail = undefined;
  }

  // --- 3. Verificar Estado ---
  verifyStatus(): void {
    if (!this.verifyReferenceCode.trim()) {
      alert('Ingresa un código de referencia');
      return;
    }

    this.loadingVerify = true;
    this.factusPay.checkStatus(this.verifyReferenceCode.trim()).subscribe({
      next: (res) => {
        this.loadingVerify = false;
        this.verifiedResult = res.data;
      },
      error: (err) => {
        this.loadingVerify = false;
        alert(`Error consultando recaudo: ${err.error?.error || err.message}`);
      }
    });
  }

  // --- 4. Simulador Sandbox ---
  executeSimulation(): void {
    if (!this.simulateReferenceCode.trim()) {
      alert('Ingresa el código de referencia a simular');
      return;
    }

    this.loadingSimulate = true;
    this.factusPay.simulatePayment(
      this.simulateReferenceCode.trim(),
      this.simulateScenario,
      this.simulateAmount
    ).subscribe({
      next: (res) => {
        this.loadingSimulate = false;
        this.simulationResult = res;
        this.loadWebhookLogs();
        this.loadCollections();
      },
      error: (err) => {
        this.loadingSimulate = false;
        alert(`Error en simulación: ${err.error?.error || err.message}`);
      }
    });
  }

  // --- 5. Diagnóstico & Webhooks ---
  testApiConnection(): void {
    this.loadingDiagnostic = true;
    this.factusPay.testConnection().subscribe({
      next: (res) => {
        this.loadingDiagnostic = false;
        this.diagnosticData = res;
      },
      error: (err) => {
        this.loadingDiagnostic = false;
        console.error('Error probando conexión:', err);
      }
    });
  }

  loadWebhookLogs(): void {
    this.loadingWebhooks = true;
    this.factusPay.getWebhookLogs().subscribe({
      next: (res) => {
        this.loadingWebhooks = false;
        this.webhookLogs = res.logs || [];
      },
      error: (err) => {
        this.loadingWebhooks = false;
        console.error('Error cargando logs de webhooks:', err);
      }
    });
  }

  clearWebhooks(): void {
    if (confirm('¿Deseas vaciar el registro de webhooks?')) {
      this.factusPay.clearWebhookLogs().subscribe(() => {
        this.webhookLogs = [];
      });
    }
  }

  copyText(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      alert('¡Copiado al portapapeles!');
    });
  }
}
