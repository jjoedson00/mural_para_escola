const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const dbPath = process.env.RENDER ? '/tmp/avisos.db' : './avisos.db';
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// INFORMAÇÃO PARA O RENDER: Avisa ao Express que ele está rodando atrás de um proxy reverso (Nuvem)
app.set('trust proxy', 1);

// CONFIGURAÇÃO DA SESSÃO SEGURA (Isola contas no mesmo navegador e evita conflitos)
app.use(session({
    name: 'mural_escolar_session_id', // Renomeado para forçar a expiração de cookies travados velhos
    secret: 'chave-secreta-mural-escola-tcc-2026-segura-fixa',
    resave: true,
    saveUninitialized: false,
    proxy: true, // Obrigatório para funcionamento estável em servidores como o Render
    cookie: { 
        secure: false, // Mantido false para total compatibilidade em HTTP local e HTTPS do Render
        maxAge: 1000 * 60 * 60 * 24, // Preserva o login do usuário ativo por 24 horas fixas
        sameSite: 'lax'
    }
}));

// Servir os arquivos visuais e scripts de suporte da pasta public de forma limpa
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// -------------------------------------------------------------
// SISTEMA DE ENTREGA DE ROTAS LIMPAS (SEM EXTENSÃO .HTML)
// -------------------------------------------------------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/cadastro', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cadastro.html'));
});

app.get('/mural', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mural.html'));
});

app.get('/publicar', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'publicar.html'));
});
// -------------------------------------------------------------

// Configuração de armazenamento para imagens de referência enviadas nos avisos
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// INICIALIZAÇÃO DO BANCO DE DADOS (SQLite local autogerado)
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

// Chave mestra secreta institucional para cargos da equipe escolar
const CHAVE_MESTRA = "COORDENACAO2026";

// API: Cadastro de Usuários (Validando a barreira de cargos institucionais)
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

// API: Login de Usuários (Gera crachá único req.session.usuario)
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

// API: Verificar Identidade da Sessão em tempo real (Quem sou eu?)
app.get('/api/usuario-atual', (req, res) => {
    if (req.session && req.session.usuario) {
        res.json({ logado: true, ...req.session.usuario });
    } else { res.json({ logado: false }); }
});

// API: Destruir Credenciais de Acesso (Logout completo limpando cookies)
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ erro: "Não foi possível deslogar" });
        res.clearCookie('mural_escolar_session_id');
        res.json({ sucesso: true });
    });
});

// API: Publicar Comunicados (Bloqueia Alunos/Responsáveis e anexa imagem opcional)
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

// API: Baixar Lista Dinâmica (Oculta comunicados de visibilidade 'interno' para alunos/responsáveis)
app.get('/api/avisos', (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ erro: "Acesso negado!" });
    const { cargo } = req.session.usuario;
    
    let query = `SELECT * FROM avisos WHERE visibilidade = 'geral' ORDER BY data DESC`;
    if (cargo === 'professor' || cargo === 'coordenador' || cargo === 'direcao') {
        query = `SELECT * FROM avisos ORDER BY data DESC`;
    }
    
    db.all(query, [], (err, rows) => { res.json(rows); });
});

// API: Deletar Avisos do Mural (Restrito a funcionários da instituição)
app.delete('/api/avisos/:id', (req, res) => {
    if (!req.session.usuario) return res.status(401).json({ erro: "Usuário não autenticado!" });
    const { cargo } = req.session.usuario;
    
    if (cargo === 'aluno' || cargo === 'responsavel') return res.status(403).json({ erro: "Permissão negada!" });
    
    db.run(`DELETE FROM avisos WHERE id = ?`, [req.params.id], (err) => { res.json({ sucesso: true }); });
});

// DISPARO DINÂMICO DE PORTAS: Integração nativa para rodar no Render (process.env.PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando com sucesso na porta ${PORT}`));
