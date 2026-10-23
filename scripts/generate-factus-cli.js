const factusService = require('../src/services/factus.service');

async function main() {
  const args = process.argv.slice(2);
  const amountArg = args[0] || '20000';
  const amount = parseInt(amountArg, 10);

  console.log('===========================================================');
  console.log('⚡ PRUEBA DE GENERACIÓN DE RECAUDO QR - FACTUS PAY');
  console.log(`💰 Monto a cobrar:     $${amount.toLocaleString('es-CO')} COP`);
  console.log('===========================================================');

  try {
    const result = await factusService.createCollection({
      amount: amount,
      description: `Cobro Factus Pay CLI $${amount} COP`
    });

    console.log('\n✅ RECAUDO CREADO EXITOSAMENTE EN FACTUS PAY:');
    console.log(`- Código Referencia:   ${result.data.reference_code}`);
    console.log(`- Estado Inicial:      ${result.data.status}`);
    console.log(`- Monto:               $${result.data.amount} ${result.data.currency || 'COP'}`);
    console.log(`- Llave Bre-B:         ${result.data.breb_key}`);
    console.log(`- Fecha Creación:      ${result.data.created_at}`);
    console.log(`- Fecha Expiración:    ${result.data.qr_expires_at || 'N/A'}`);
    
    if (result.data.qr || result.data.qr_image) {
      const qrStr = result.data.qr || result.data.qr_image;
      console.log(`- QR Base64:           ${qrStr.substring(0, 50)}... (${qrStr.length} caracteres)`);
      console.log('\n👉 Para incrustar en HTML usa:');
      console.log(`   <img width="300" height="300" src="${qrStr.substring(0, 40)}...">`);
    }

    console.log('\n🔍 Consultando estado del recaudo recién creado...');
    const detail = await factusService.getCollection(result.data.reference_code);
    console.log(`- Estado actual del recaudo: ${detail.data.status}`);
    console.log('\n🎉 ¡Integración con Factus Pay verificada y funcionando!');
  } catch (error) {
    console.error('\n❌ ERROR FACTUS PAY:', error.message);
    if (error.details) {
      console.error('Detalles API:', JSON.stringify(error.details, null, 2));
    }
    process.exit(1);
  }
}

main();
