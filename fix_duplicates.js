require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixDuplicates() {
    try {
        console.log('🔧 Iniciando correção de duplicatas...');

        // Encontra nomes duplicados
        const duplicates = await pool.query(`
            SELECT nome, array_agg(id ORDER BY id ASC) as ids
            FROM atendentes 
            GROUP BY nome 
            HAVING COUNT(*) > 1
        `);

        if (duplicates.rows.length === 0) {
            console.log('✅ Nenhuma duplicata para corrigir.');
            return;
        }

        for (const row of duplicates.rows) {
            const nome = row.nome;
            const ids = row.ids; // Array of IDs, e.g. [3, 5]
            const masterId = ids[0]; // Keep the first one (e.g. 3)
            const duplicateIds = ids.slice(1); // [5]

            console.log(`\nProcessing '${nome}': Manter ${masterId}, Remover ${duplicateIds.join(', ')}`);

            for (const dupId of duplicateIds) {
                // 1. Atualizar Usuarios
                const resUser = await pool.query('UPDATE usuarios SET atendente_id = $1 WHERE atendente_id = $2', [masterId, dupId]);
                if (resUser.rowCount > 0) console.log(`  - Atualizados ${resUser.rowCount} usuários para ID ${masterId}`);

                // 2. Atualizar Conversas
                const resConv = await pool.query('UPDATE conversas SET atendente_id = $1 WHERE atendente_id = $2', [masterId, dupId]);
                if (resConv.rowCount > 0) console.log(`  - Atualizadas ${resConv.rowCount} conversas para ID ${masterId}`);

                // 3. Atualizar Mensagens
                const resMsg = await pool.query('UPDATE mensagens SET atendente_id = $1 WHERE atendente_id = $2', [masterId, dupId]);
                if (resMsg.rowCount > 0) console.log(`  - Atualizadas ${resMsg.rowCount} mensagens para ID ${masterId}`);

                // 4. Deletar Atendente Duplicado
                await pool.query('DELETE FROM atendentes WHERE id = $1', [dupId]);
                console.log(`  🗑️ Atendente ID ${dupId} deletado.`);
            }
        }

        console.log('\n✅ Correção concluída!');

    } catch (error) {
        console.error('❌ Erro Fatal:', error);
    } finally {
        await pool.end();
    }
}

fixDuplicates();
