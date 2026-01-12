module.exports = {
    apps: [
        {
            name: 'whatsapp-bot',
            script: './src/server.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '800M',
            node_args: "--dns-result-order=ipv4first",
            env: {
                NODE_ENV: 'production',
                PORT: 3000
            },
            error_file: './logs/error.log',
            out_file: './logs/out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        }
    ]
};
