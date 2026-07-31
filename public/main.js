// VARIÁVEIS GLOBAIS DE CONTROLE
let totalAvisosConhecidos = null;
let bancoAvisosLocal = [];

// 1. OCULTAR OU EXIBIR CAMPO DE CHAVE MESTRA NO CADASTRO
function toggleChaveAcesso() {
    const cargoInput = document.getElementById('cad-cargo');
    const divChave = document.getElementById('div-chave');
    const cadChave = document.getElementById('cad-chave');

    if (!cargoInput || !divChave || !cadChave) return;

    const cargo = cargoInput.value;

    if (cargo === 'aluno' || cargo === 'responsavel') {
        divChave.classList.add('hidden');
        cadChave.removeAttribute('required');
    } else {
        divChave.classList.remove('hidden');
        cadChave.setAttribute('required', 'true');
    }
}

// 2. MONITOR DE DIGITAÇÃO DA BARRA DE PESQUISA
const campoPesquisa = document.getElementById('campo-pesquisa');
if (campoPesquisa) {
    campoPesquisa.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        filtrarEMostrarAvisos(termo);
    });
}

// 3. GERADOR AUTOMÁTICO DE QR CODE REVISADO SEM ERROS
function gerarQrCodeAutomatico() {
    const containerQr = document.getElementById('canvas-qrcode');
    if (!containerQr) return;
    
    // Captura o link real do Render direto do navegador
    const urlAtual = window.location.origin; 
    
    // Limpa a bolinha branca antiga e remove estilos conflitantes
    containerQr.innerHTML = "";
    containerQr.style.background = "transparent";
    containerQr.style.padding = "0";
    containerQr.style.boxShadow = "none";
    
    // Gera o bloco usando o novo motor seguro conectado ao HTML
    if (window.LocalQRCode && typeof window.LocalQRCode.generate === 'function') {
        var qrcodeElement = window.LocalQRCode.generate(urlAtual);
        containerQr.appendChild(qrcodeElement);
    }
}

// 4. ENVIO DO FORMULÁRIO DE CADASTRO
const cadastroForm = document.getElementById('cadastro-form');
if (cadastroForm) {
    cadastroForm.addEventListener('submit', async (e) => {
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
        if (resultado.sucesso) { 
            alert('Conta criada com sucesso!'); 
            window.location.href = '/login'; 
        } else { 
            alert(resultado.erro); 
        }
    });
}

// 5. ENVIO DO FORMULÁRIO DE LOGIN
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-senha').value;
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, senha })
        });
        const resultado = await res.json();
        if (resultado.sucesso) { 
            window.location.href = '/mural'; 
        } else { 
            alert(resultado.erro); 
        }
    });
}

// 6. PROTEÇÃO DA PÁGINA DO MURAL
async function protegerPaginaMural() {
    try {
        const res = await fetch('/api/usuario-atual', { cache: 'no-store' });
        const usuario = await res.json();
        if (!usuario || !usuario.logado) { 
            window.location.href = '/login'; 
            return; 
        }

        const userDisplay = document.getElementById('user-display');
        if (userDisplay) { 
            userDisplay.innerText = `${usuario.nome} (${usuario.cargo})`; 
        }
        
        const btnPublicar = document.getElementById('btn-ir-publicar');
        if (btnPublicar) {
            if (usuario.cargo !== 'aluno' && usuario.cargo !== 'responsavel') { 
                btnPublicar.classList.remove('hidden'); 
            } else { 
                btnPublicar.classList.add('hidden'); 
            }
        }
        
        await baixarAvisosDoServidor(usuario.cargo);
        setInterval(() => checarNovosAvisosSilenciosamente(usuario.cargo), 5000);

    } catch (erro) { 
        window.location.href = '/login'; 
    }
}

// 7. BAIXAR AVISOS INICIAIS DO SERVIDOR
async function baixarAvisosDoServidor(cargoUsuario) {
    const res = await fetch('/api/avisos', { cache: 'no-store' });
    bancoAvisosLocal = await res.json();
    
    if (totalAvisosConhecidos === null) { 
        totalAvisosConhecidos = bancoAvisosLocal.length; 
    }
    
    filtrarEMostrarAvisos("", cargoUsuario);
}

// 8. DESENHAR E FILTRAR OS BLOCOS DE AVISO NA TELA
function filtrarEMostrarAvisos(termoPesquisa = "", cargoUsuario = null) {
    const container = document.getElementById('lista-avisos');
    if (!container) return;
    container.innerHTML = '';
    
    if (!cargoUsuario) {
        const userDisplay = document.getElementById('user-display');
        const textoCabecalho = userDisplay ? userDisplay.innerText : "";
        if (textoCabecalho.includes('aluno')) {
            cargoUsuario = 'aluno';
        } else if (textoCabecalho.includes('responsavel')) {
            cargoUsuario = 'responsavel';
        } else {
            cargoUsuario = 'professor';
        }
    }

    const avisosFiltrados = bancoAvisosLocal.filter(aviso => {
        return aviso.titulo.toLowerCase().includes(termoPesquisa) || 
               aviso.conteudo.toLowerCase().includes(termoPesquisa);
    });

    if (avisosFiltrados.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#64748b; margin-top:30px; font-weight:600;">Nenhum aviso encontrado para esta busca.</p>`;
        return;
    }

    avisosFiltrados.forEach(aviso => {
        const item = document.createElement('div');
        item.className = 'card';
        
        if (aviso.visibilidade === 'interno') { 
            item.style.borderLeft = '6px solid var(--warning)'; 
        } else { 
            item.style.borderLeft = '6px solid var(--primary)'; 
        }
        
        let botaoApagar = '';
        if (cargoUsuario !== 'aluno' && cargoUsuario !== 'responsavel') {
            botaoApagar = `<button class="btn-danger" style="font-size:13px; width: fit-content; margin-top: 15px; padding: 10px 20px;" onclick="deletarAviso(${aviso.id})">Apagar Aviso</button>`;
        }

        const tagPrivacidade = aviso.visibilidade === 'interno' ? 
            `<span style="background: rgba(255, 159, 67, 0.15); color: var(--warning); padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-left: 10px;">🔒 RESTRITO EQUIPE</span>` : '';

        item.innerHTML = `
            <div class="aviso-conteudo-bloco">
                <h3 style="margin-top:0; font-size: 22px; color: #ffffff; display: flex; align-items: center;">${aviso.titulo} ${tagPrivacidade}</h3>
                <p style="margin: 0;"><small style="color: #94a3b8;">Postado por: <b>${aviso.autor}</b> em ${new Date(aviso.data).toLocaleDateString('pt-BR')}</small></p>
                <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1; margin-top: 15px; margin-bottom: 5px; white-space: pre-line;">${aviso.conteudo}</p>
                ${botaoApagar}
            </div>
            ${aviso.imagem ? `<img src="${aviso.imagem}" class="aviso-img" alt="Referência">` : ''}
        `;
        container.appendChild(item);
    });
}

// 9. CHECAGEM SILENCIOSA EM SEGUNDO PLANO (NOTIFICAÇÕES)
async function checarNovosAvisosSilenciosamente(cargoUsuario) {
    try {
        const res = await fetch('/api/avisos', { cache: 'no-store' });
        const avisos = await res.json();

        if (totalAvisosConhecidos !== null && avisos.length > totalAvisosConhecidos) {
            const maisRecente = avisos[0]; 
            totalAvisosConhecidos = avisos.length;
            
            bancoAvisosLocal = avisos;
            const campoP = document.getElementById('campo-pesquisa');
            const termoAtual = campoP ? campoP.value.toLowerCase() : "";
            filtrarEMostrarAvisos(termoAtual, cargoUsuario);

            if (Notification.permission === "granted" && maisRecente) {
                new Notification("📢 Novo Aviso Escolar!", {
                    body: `Título: ${maisRecente.titulo}\nPostado por: ${maisRecente.autor}`,
                    icon: maisRecente.imagem || '/favicon.ico'
                });
            }
        } else { 
            totalAvisosConhecidos = avisos.length; 
        }
    } catch (e) { 
        console.error(e); 
    }
}

// 10. GERENCIAR PERMISSÕES DE NOTIFICAÇÃO
function verificarPermissaoNotificacao() {
    const barra = document.getElementById('barra-notificacao');
    if (!barra) return;
    if ("Notification" in window) {
        if (Notification.permission === "default") { 
            barra.classList.remove('hidden'); 
        } else { 
            barra.classList.add('hidden'); 
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

// 11. DELETAR UM AVISO SELECIONADO
async function deletarAviso(id) {
    if (!confirm("Tem certeza que quer apagar esse aviso?")) return;
    const res = await fetch(`/api/avisos/${id}`, { method: 'DELETE' });
