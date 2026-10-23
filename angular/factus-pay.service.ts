import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, timer } from 'rxjs';
import { switchMap, takeWhile, map } from 'rxjs/operators';
import { 
  CreateFactusCollectionRequest, 
  FactusCollectionData, 
  FactusApiResponse,
  FactusCollectionsListResponse,
  FactusCollectionFilters,
  FactusTestConnectionResponse,
  FactusSimulateRequest,
  FactusSimulateResponse,
  FactusWebhookLogsResponse,
  FactusSimulationScenario
} from './factus-pay.models';

/**
 * Servicio Angular para Factus Pay (Bre-B Colombia)
 * Provee integración completa con la API de recaudos, interoperabilidad bancaria y simulación
 */
@Injectable({
  providedIn: 'root'
})
export class FactusPayService {
  // URL base del backend Node.js que custodia las credenciales de Factus
  private readonly baseUrl = 'http://localhost:3000/api/factus';

  constructor(private http: HttpClient) {}

  /**
   * Generar nuevo recaudo y código QR en Factus Pay (POST /api/factus/generate)
   * @param request Monto, referencia opcional y concepto
   */
  createCollection(request: CreateFactusCollectionRequest): Observable<FactusApiResponse<FactusCollectionData>> {
    return this.http.post<FactusApiResponse<FactusCollectionData>>(
      `${this.baseUrl}/generate`, 
      request
    );
  }

  /**
   * Generación rápida recibiendo únicamente el monto
   * @param amount Monto en pesos colombianos (entre 1.000 y 12.100.000)
   * @param description Concepto opcional
   */
  generateQuickQr(amount: number, description?: string): Observable<FactusApiResponse<FactusCollectionData>> {
    return this.createCollection({
      amount: Math.round(amount),
      description: description || `Recaudo Factus Pay $${amount.toLocaleString('es-CO')} COP`
    });
  }

  /**
   * Consultar estado y detalle en tiempo real de un recaudo
   * @param referenceCode Código de referencia único de la transacción
   */
  checkStatus(referenceCode: string): Observable<FactusApiResponse<FactusCollectionData>> {
    return this.http.get<FactusApiResponse<FactusCollectionData>>(
      `${this.baseUrl}/status/${encodeURIComponent(referenceCode)}`
    );
  }

  /**
   * Listar recaudos registrados con soporte para paginación y filtros
   * @param filters Filtros de búsqueda (página, estado, código de referencia)
   */
  listCollections(filters: FactusCollectionFilters = {}): Observable<FactusCollectionsListResponse> {
    let params = new HttpParams();
    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.status && filters.status !== 'all') params = params.set('status', filters.status);
    if (filters.reference_code) params = params.set('reference_code', filters.reference_code);

    return this.http.get<FactusCollectionsListResponse>(`${this.baseUrl}/collections`, { params });
  }

  /**
   * Sondeo automático (Polling) del estado del recaudo
   * Se detiene automáticamente cuando pasa a 'paid', 'failed' o 'rejected'
   * @param referenceCode Código de referencia
   * @param intervalMs Intervalo en milisegundos (por defecto 2,500ms)
   */
  pollStatusUntilFinished(
    referenceCode: string, 
    intervalMs: number = 2500
  ): Observable<FactusCollectionData> {
    return timer(0, intervalMs).pipe(
      switchMap(() => this.checkStatus(referenceCode)),
      map(res => res.data),
      takeWhile(
        col => col.status === 'ready' || col.status === 'started', 
        true // Emite el último cambio cuando pasa a paid/failed/rejected
      )
    );
  }

  /**
   * Escuchar eventos en tiempo real vía Server-Sent Events (SSE)
   * Recibe notificaciones instantáneas de escaneo (started) y pago completado (paid)
   */
  listenEvents(): Observable<{ type: string; data: any }> {
    return new Observable(observer => {
      const eventSource = new EventSource(`${this.baseUrl}/events`);
      
      eventSource.addEventListener('qr_scanned', (e: any) => {
        try { observer.next({ type: 'qr_scanned', data: JSON.parse(e.data) }); } catch(err){}
      });

      eventSource.addEventListener('payment_update', (e: any) => {
        try { observer.next({ type: 'payment_update', data: JSON.parse(e.data) }); } catch(err){}
      });

      eventSource.onerror = err => observer.error(err);

      return () => eventSource.close();
    });
  }

  /**
   * Marcar recaudo como escaneado por el pagador (estado started)
   * @param referenceCode Código de referencia
   */
  markAsScanned(referenceCode: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/scan/${encodeURIComponent(referenceCode)}`, {});
  }

  /**
   * Probar conectividad y medir latencia con la API de Factus Pay Sandbox
   */
  testConnection(): Observable<FactusTestConnectionResponse> {
    return this.http.get<FactusTestConnectionResponse>(`${this.baseUrl}/test-connection`);
  }

  /**
   * Simular un escenario de pago en el entorno Sandbox
   * @param referenceCode Código de referencia del recaudo
   * @param scenario 'paid' | 'tx_insufficient_funds' | 'tx_account_error' | 'tx_timeout'
   * @param amount Monto de la transacción
   */
  simulatePayment(
    referenceCode: string, 
    scenario: FactusSimulationScenario = 'paid', 
    amount?: number
  ): Observable<FactusSimulateResponse> {
    const payload: FactusSimulateRequest = {
      reference_code: referenceCode,
      scenario,
      amount
    };
    return this.http.post<FactusSimulateResponse>(`${this.baseUrl}/simulate`, payload);
  }

  /**
   * Obtener registro de webhooks recibidos en tiempo real
   */
  getWebhookLogs(): Observable<FactusWebhookLogsResponse> {
    return this.http.get<FactusWebhookLogsResponse>(`${this.baseUrl}/webhooks`);
  }

  /**
   * Limpiar historial de webhooks
   */
  clearWebhookLogs(): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.baseUrl}/webhooks`);
  }
}
