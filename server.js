const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const db = new sqlite3.Database('./avisos.db');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// IMPORTANTE PARA O RENDER: Informa ao Express que ele está atrás de um proxy reverso
app.set('trust proxy', 1);

// Configuração estável de sessões para rodar em produção (Nuvem)
app.use(session({
    name: 'mural_escolar_session_id',
    secret: 'chave-secreta-mural-escola-tcc-2026-segura-fixa',
    resave: true,
    saveUninitialized: false,
    proxy: true, // Garante o funcionamento seguro passando pelo proxy do Render
    cookie: { 
        secure: false, // Mantido false para compatibilidade simples, mude para true se exigir HTTPS estrito
        maxAge: 1000 * 60 * 60 * 24, // Mantém o usuário conectado por 24 horas
        sameSite: 'lax'
    }
}));

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        email TEXT UNIQUE,
        senha TEXT,
        cargo TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS avisos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        conteudo TEXT,
        imagem TEXT,
        autor TEXT,
        visibilidade TEXT DEFAULT 'geral',
        data DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const CHAVE_MESTRA = "COORDENACAO2026";

app.post('/api/cadastro', async (req, res) => {
    const { nome, email, senha, cargo, tokenAcesso } = req.body;
    if ((cargo === 'professor' || cargo === 'coordenador' || cargo === 'direcao') && tokenAcesso !== CHAVE_MESTRA) {
        return res.status(401).json({ erro: "Chave de acesso inválida para este cargo!" });
    }
    try {
        const senhaCriptografada = await bcrypt.hash(senha, 10);
        db.run(`INSERT INTO usuarios (nome, email, senha, cargo) VALUES (?, ?, ?, ?)`, 
            [nome, email, senhaCriptografada, cargo], 
            function(err) {
                if (err) return res.status(400).json({ erro: "E-mail já cadastrado!" });
                res.json({ sucesso: true });
            }
        );
    } catch (e) { res.status(500).json({ erro: "Erro no servidor." }); }
});

app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, usuario) => {
        if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
            return res.status(400).json({ erro: "Credenciais inválidas!" });
        }
        req.session.usuario = { id: usuario.id, nome: usuario.nome, cargo: usuario.cargo };
        res.json({ sucesso: true, cargo: usuario.cargo, nome: usuario.nome });
    });
});

app.get('/api/usuario-atual', (req, res) => {
    if (req.session && req.session.usuario) {
        res.json({ logado: true, ...req.session.usuario });
    } else { res.json({ logado: false }); }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ erro: "Não foi possível deslogar" });
        res.clearCookie('mural_escolar_session_id');
        res.json({ Urban: true, sucesso: true });
    });
});

app.post('/api/avisos', upload.single('imagem'), (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ erro: "Usuário não autenticado!" });
    const { cargo, nome } = req.session.usuario;
    const { titulo, conteudo, visibilidade } = req.body;
    if (cargo === 'aluno' || cargo === 'responsavel') {
        return res.status(403).json({ erro: "Apenas funcionários podem publicar avisos!" });
    }
    const imagemUrl = req.file ? `/uploads/${req.file.filename}` : null;
    db.run(`INSERT INTO avisos (titulo, conteudo, imagem, autor, visibilidade) VALUES (?, ?, ?, ?, ?)`,
        [titulo, conteudo, imagemUrl, nome, visibilidade],
        function(err) {
            if (err) return res.status(500).json({ erro: "Erro ao salvar aviso." });
            res.json({ sucesso: true });
        }
    );
});

app.get('/api/avisos', (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ erro: "Acesso negado!" });
    const { cargo } = req.session.usuario;
    let query = `SELECT * FROM avisos WHERE visibilidade = 'geral' ORDER BY data DESC`;
    if (cargo === 'professor' || cargo === 'coordenador' || cargo === 'direcao') {
        query = `SELECT * FROM avisos ORDER BY data DESC`;
    }
    db.all(query, [], (err, rows) => { res.json(rows); });
});

app.delete('/api/avisos/:id', (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ erro: "Usuário não autenticado!" });
    const { cargo } = req.session.usuario;
    if (cargo === 'aluno' || cargo === 'responsavel') return res.status(403).json({ erro: "Permissão negada!" });
    db.run(`DELETE FROM avisos WHERE id = ?`, [req.params.id], (err) => { res.json({ sucesso: true }); });
});

// MODIFICAÇÃO OBRIGATÓRIA: O Render escolhe a porta dinamicamente (process.env.PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando com sucesso na porta ${PORT}`));
