const dns = require('dns');

const hostname = 'db.ihwjchqhpbxwmuzuxgeo.supabase.co';

console.log(`Testando resolução DNS para: ${hostname}`);

dns.resolve4(hostname, (err, addresses) => {
    if (err) {
        console.error('❌ IPv4 (A record): FALHOU', err.code);
    } else {
        console.log('✅ IPv4 (A record):', addresses);
    }
});

dns.resolve6(hostname, (err, addresses) => {
    if (err) {
        console.error('❌ IPv6 (AAAA record): FALHOU', err.code);
    } else {
        console.log('✅ IPv6 (AAAA record):', addresses);
    }
});
