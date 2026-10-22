const openpayService = require('../src/services/openpay.service');

async function main() {
  const args = process.argv.slice(2);
  const amountArg = args[0] || '20000';
  const amount = parseInt(amountArg, 10);

  console.log('===========================================================');
  console.log('🤖 PRUEBA DE GENERACIÓN DE CARGO QR - OPENPAY COLOMBIA');
  console.log(`💰 Monto a cobrar:   $${amount.toLocaleString('es-CO')} COP`);
  console.log('===========================================================');

  try {
    const result = await openpayService.createQrCharge({
      amount: amount,
      description: `Cobro de prueba CLI por $${amount} COP`,
      order_id: `CLI-ORD-${Date.now()}`,
      customer: {
        name: 'Cliente',
        last_name: 'Terminal',
        email: 'cliente.cli@ejemplo.co',
        phone_number: '3009876543'
      }
    });

    console.log('\n✅ RESULTADO OBTENIDO:');
    console.log(`- ID Transacción:     ${result.data.id}`);
    console.log(`- Estado:             ${result.data.status}`);
    console.log(`- Moneda:             ${result.data.currency}`);
    console.log(`- Monto:              $${result.data.amount}`);
    console.log(`- Modo Simulación:    ${result.is_simulation ? 'SÍ (Fallback por flag QR en Openpay)' : 'NO (Openpay Real)'}`);
    console.log(`- Temporizador:       ${result.data.timer.duration_minutes} minutos (${result.data.timer.expires_at})`);
    
    if (result.data.payment_method?.barcode_base64) {
      console.log(`- Barcode Base64:     ${result.data.payment_method.barcode_base64.substring(0, 50)}... (${result.data.payment_method.barcode_base64.length} caracteres)`);
      console.log('\n👉 Para incrustar en HTML usa:');
      console.log(`   <img width="350" height="350" src="data:image/png;base64,${result.data.payment_method.barcode_base64.substring(0, 30)}...">`);
    }

    console.log('\n🔍 Probando consulta de estado (GET status)...');
    const statusResult = await openpayService.getChargeStatus(result.data.id);
    console.log(`- Estado actual de transacción: ${statusResult.data.status}`);
    console.log('\n🎉 ¡Flujo de integración completado exitosamente!');
  } catch (error) {
    console.error('\n❌ ERROR AL GENERAR CARGO QR:', error.message);
    if (error.openpayError) {
      console.error('Detalles Openpay:', JSON.stringify(error.openpayError, null, 2));
    }
    process.exit(1);
  }
}

main();
