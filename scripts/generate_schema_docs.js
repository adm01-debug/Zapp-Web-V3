#!/usr/bin/env node
/**
 * generate_schema_docs.js
 * Gera documentação SQL → Markdown dos schemas do banco
 * Uso: node scripts/generate_schema_docs.js
 */

const { Client } = require('pg');

async function generateDocs() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  const schemas = ['zapp', 'evo', 'bpm', 'ops', 'financeiro', 'vendas', 'logistica', 'ai', 'archive'];

  for (const schema of schemas) {
    // Tables
    const tables = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = $1
      ORDER BY tablename
    `, [schema]);

    // Views
    const views = await client.query(`
      SELECT viewname
      FROM pg_views
      WHERE schemaname = $1
      ORDER BY viewname
    `, [schema]);

    // Functions
    const functions = await client.query(`
      SELECT p.proname, pg_get_function_result(p.oid) AS return_type
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1
        AND p.prokind = 'f'
      ORDER BY p.proname
    `, [schema]);

    console.log(`## ${schema}`);
    console.log(`Tables: ${tables.rows.length}`);
    console.log(`Views: ${views.rows.length}`);
    console.log(`Functions: ${functions.rows.length}`);
    console.log();
  }

  await client.end();
}

generateDocs().catch(console.error);
