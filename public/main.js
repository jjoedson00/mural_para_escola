let totalAvisosConhecidos = null; // Guarda quantos avisos já estavam na tela

function toggleChaveAcesso() {
    const cargo = document.getElementById('cad-cargo').value;
    const divChave = document.getElementById('div-chave');
    if (cargo === 'aluno' || cargo === 'responsavel') {
        divChave.classList.add('hidden');
        document.getElementById('cad-chave').removeAttribute('required');
    } else {
        divChave.classList.remove('hidden');
        document.getElementById('cad-chave').setAttribute('required', 'true');
    }
}

if(document.getElementById('cadastro-form')) {
    document.getElementById('cadastro-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const dados = {
            nome: document.getElementById('cad-nome').value,
            email: document.getElementById('cad-email').value,
            senha: document.getElementById('cad-senha').value,
            cargo: document.getElementById('cad-cargo').value,
            tokenAcesso: document.getElementById('cad-chave').value
        };
        const res = await fetch('/api/cadastro', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dados)
        });
        const resultado = await res.json();
        if(resultado.sucesso) { alert('Conta criada com sucesso!'); window.location.href = 'index.html'; } 
        else { alert(resultado.erro); }
    });
}

if(document.getElementById('login-form')) {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-senha').value;
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, senha })
        });
        const resultado = await res.json();
        if(resultado.sucesso) { window.location.href = 'mural.html'; } 
        else { alert(resultado.erro); }
    });
}

async function protegerPaginaMural() {
    try {
        const res = await fetch('/api/usuario-atual', { cache: 'no-store' });
        const usuario = await res.json();
        if (!usuario || !usuario.logado) { window.location.href = 'index.html'; return; }

        const userDisplay = document.getElementById('user-display');
        if (userDisplay) { userDisplay.innerText = `${usuario.nome} (${usuario.cargo})`; }
        
        const btnPublicar = document.getElementById('btn-ir-publicar');
        if (btnPublicar) {
            if (usuario.cargo !== 'aluno' && usuario.cargo !== 'responsavel') { btnPublicar.classList.remove('hidden'); } 
            else { btnPublicar.classList.add('hidden'); }
        }
        
        // Primeira carga dos avisos
        await carregarAvisos(usuario.cargo);

        // CONFIGURAÇÃO DA NOTIFICAÇÃO: Checa novos avisos a cada 5 segundos automaticamente
        setInterval(() => checarNovosAvisosSilenciosamente(usuario.cargo), 5000);

    } catch (erro) { window.location.href = 'index.html'; }
}

async function carregarAvisos(cargoUsuario) {
    const res = await fetch('/api/avisos', { cache: 'no-store' });
    const avisos = await res.json();
    
    // Define a contagem inicial para sabermos quando um novo chegar
    if (totalAvisosConhecidos === null) {
        totalAvisosConhecidos = avisos.length;
    }

    const container = document.getElementById('lista-avisos');
    if(!container) return;
    container.innerHTML = '';

    avisos.forEach(aviso => {
        const item = document.createElement('div');
        item.className = 'card';
        
        if (aviso.visibilidade === 'interno') {
            item.style.borderLeft = '6px solid var(--warning)';
        } else {
            item.style.borderLeft = '6px solid var(--primary)';
        }
        
        let botaoApagar = '';
        if(cargoUsuario !== 'aluno' && cargoUsuario !== 'responsavel') {
            botaoApagar = `<button class="btn-danger" style="font-size:13px; width: fit-content; margin-top: 15px; padding: 10px 20px;" onclick="deletarAviso(${aviso.id})">Apagar Aviso</button>`;
        }

        const tagPrivacidade = aviso.visibilidade === 'interno' ? 
            `<span style="background: rgba(255, 159, 67, 0.15); color: var(--warning); padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-left: 10px;">🔒 RESTRITO EQUIPE</span>` : '';

        item.innerHTML = `
            <div class="aviso-conteudo-bloco">
                <h3 style="margin-top:0; font-size: 22px; color: #0f172a; display: flex; align-items: center;">${aviso.titulo} ${tagPrivacidade}</h3>
                <p style="margin: 0;"><small style="color: #64748b;">Postado por: <b>${aviso.autor}</b> em ${new Date(aviso.data).toLocaleDateString('pt-BR')}</small></p>
                <p style="font-size: 16px; line-height: 1.6; color: #334155; margin-top: 15px; margin-bottom: 5px; white-space: pre-line;">${aviso.conteudo}</p>
                ${botaoApagar}
            </div>
            ${aviso.imagem ? `<img src="${aviso.imagem}" class="aviso-img">` : ''}
        `;
        container.appendChild(item);
    });
}

// Monitora o banco em segundo plano para disparar a notificação real
async function checarNovosAvisosSilenciosamente(cargoUsuario) {
    try {
        const res = await fetch('/api/avisos', { cache: 'no-store' });
        const avisos = await res.json();

        // Se a quantidade no banco for maior do que o front-end conhece, tem aviso novo!
        if (totalAvisosConhecidos !== null && avisos.length > totalAvisosConhecidos) {
            const maisRecente = avisos[0]; // Pega o aviso do topo da lista
            
            totalAvisosConhecidos = avisos.length; // Atualiza o contador interno
            carregarAvisos(cargoUsuario);          // Atualiza a tela na hora

            // Dispara a Notificação de Sistema do Computador/Celular
            if (Notification.permission === "granted") {
                new Notification("📢 Novo Aviso Escolar!", {
                    body: `Título: ${maisRecente.titulo}\nPostado por: ${maisRecente.autor}`,
                    icon: maisRecente.imagem || '/favicon.ico'
                });
            }
        } else {
            // Caso avisos tenham sido deletados, ajusta o contador sem notificar
            totalAvisosConhecidos = avisos.length;
        }
    } catch (e) { console.error("Erro na checagem de notificações:", e); }
}

// GERENCIAMENTO DE PERMISSÕES DA API DE NOTIFICAÇÃO
function verificarPermissaoNotificacao() {
    const barra = document.getElementById('barra-notificacao');
    if (!barra) return;

    if ("Notification" in window) {
        if (Notification.permission === "default") {
            barra.classList.remove('hidden'); // Mostra a barra pedindo ativação
        } else {
            barra.classList.add('hidden');    // Já aceitou ou bloqueou, esconde a barra
        }
    }
}

function solicitarPermissaoNotificacao() {
    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            verificarPermissaoNotificacao();
            if (permission === "granted") {
                new Notification("🔔 Notificações Ativadas!", {
                    body: "Você receberá alertas sempre que novos comunicados forem postados."
                });
            }
        });
    }
}

async function deletarAviso(id) {
    if(!confirm("Tem certeza que quer apagar esse aviso?")) return;
    const res = await fetch(`/api/avisos/${id}`, { method: 'DELETE' });
    if(res.ok) { protegerPaginaMural(); }
}

if(document.getElementById('publicar-form')) {
    document.getElementById('publicar-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('titulo', document.getElementById('pub-titulo').value);
        formData.append('conteudo', document.getElementById('pub-conteudo').value);
        formData.append('visibilidade', document.getElementById('pub-visibilidade').value);
        
        const fotoInput = document.getElementById('pub-imagem');
        if(fotoInput.files && fotoInput.files[0]) {
            formData.append('imagem', fotoInput.files[0]);
        }

        const res = await fetch('/api/avisos', { method: 'POST', body: formData });
        if(res.ok) { window.location.href = 'mural.html'; } 
        else { const erroData = await res.json(); alert(erroData.erro); }
    });
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'index.html';
}
