const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const xlsx = require('xlsx');
const bcrypt = require('bcrypt');

dotenv.config();

const port = process.env.PORT || 5000;

app.use(cors()); // Permite todas as origens e métodos

app.use(bodyParser.json());

// Conexão com o MongoDB usando variáveis do .env
const mongoUser = process.env.MONGO_USER;
const mongoPass = process.env.MONGO_PASS;
const mongoDB = process.env.MONGO_DATABASE;
const mongoClusterUrl = process.env.MONGO_CLUSTER_URL;

mongoose.connect(`mongodb+srv://${mongoUser}:${mongoPass}@${mongoClusterUrl}/${mongoDB}?retryWrites=true&w=majority`)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Definindo o modelo de Usuário
const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, unique: true },
  password: String,
  city: String,
  disciplinas: Array,
  role: String,
  cargo: String,
  curso: String,
});

const logSchema = new mongoose.Schema({
  aula_id: String,
  id: String,
  email: String,
  disciplina: String,
  dia: String,
  data: String,
  horario_inicio: String,
  horario_fim: String,
  status: String,
  duracao: String,
  timestamp: String,
});

const User = mongoose.model('User', userSchema);
const Log = mongoose.model('Log', logSchema);

// Rota de boas-vindas
app.get("/", (req, res) => {
  res.status(200).json({ message: "Bem-vindo à API" });
});

// Rota de registro
app.post('/register', async (req, res) => {
  const { username, email, password, city } = req.body;
  console.log('Register request received:', { username, email, password, city });

  if (!username || !email || !password || !city) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios!' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Usuário já existe!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = (await User.countDocuments()) === 0 ? 'admin' : 'user';
    const newUser = new User({ username, email, password: hashedPassword, city, disciplinas: [], role });
    await newUser.save();

    const token = jwt.sign({ username, email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({ token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Rota de login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Login request received:', { email, password });

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Credenciais inválidas!' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Credenciais inválidas!' });
    }

    const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

app.put('/user', async (req, res) => {
  const { email, cargo, curso, city } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado!' });
    }

    if (cargo) user.cargo = cargo;
    if (curso) user.curso = curso;
    if (city) user.city = city;

    await user.save();

    res.status(200).json({ message: 'Informações do usuário atualizadas com sucesso!', user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

app.get('/disciplinas', async (req, res) => {
  const { email } = req.query;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado!' });
    }

    if (!user.disciplinas || user.disciplinas.length === 0) {
      return res.status(404).json({ message: 'Nenhuma disciplina encontrada!' });
    }

    res.status(200).json(user.disciplinas);
  } catch (error) {
    console.error('Get disciplinas error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Rota para obter logs em andamento
app.get('/logs', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ message: 'O e-mail é obrigatório!' });
  }

  try {
    const logsEmAndamento = await Log.find({ email, status: 'Em Andamento' });
    res.status(200).json(logsEmAndamento);
  } catch (error) {
    console.error('Erro ao obter logs:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Rota para atualizar um log
app.put('/logs', async (req, res) => {
  const { email, aula_id, horario_fim, data, status } = req.body;

  if (!email || !aula_id || !horario_fim || !data || !status) {
    return res.status(400).json({ message: 'O e-mail, o ID da aula, o horário de fim, a data e o status são obrigatórios!' });
  }

  try {
    const log = await Log.findOne({ email, aula_id });

    if (!log) {
      return res.status(404).json({ message: 'Log não encontrado!' });
    }

    if (!log.horario_inicio) {
      return res.status(400).json({ message: 'O horário de início não foi encontrado no log!' });
    }

    const hoje = new Date().toLocaleDateString('pt-BR');
    if (hoje !== data) {
      return res.status(400).json({ message: 'A data fornecida não corresponde à data de hoje!' });
    }

    log.horario_fim = horario_fim;

    const inicio = new Date(`1970-01-01T${log.horario_inicio}:00`);
    const fim = new Date(`1970-01-01T${horario_fim}:00`);
    const duracao = (fim - inicio) / (1000 * 60 * 60);

    log.duracao = duracao.toFixed(2);
    log.status = status;

    await log.save();

    res.status(200).json({ message: 'Log atualizado com sucesso!', log });
  } catch (error) {
    console.error('Erro ao atualizar log:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Rota para criar um novo log
app.post('/logs', async (req, res) => {
  const { id, email, disciplina, dia, data, horario_inicio, horario_fim, status } = req.body;

  if (!id || !email || !disciplina || !dia || !data || !horario_inicio) {
    return res.status(400).json({ message: 'Campos obrigatórios ausentes!' });
  }

  const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!dataRegex.test(data)) {
    return res.status(400).json({ message: 'Data deve estar no formato DD/MM/YYYY!' });
  }

  try {
    const usuario = await User.findOne({ email });

    if (!usuario) {
      return res.status(404).json({ message: 'Usuário não encontrado!' });
    }

    const aulaId = `${id}-${new Date().getTime()}`;

    const newLog = new Log({
      aula_id: aulaId,
      id,
      email,
      disciplina,
      dia,
      data,
      horario_inicio,
      horario_fim: horario_fim || '',  
      status: status || 'Em Andamento',
      city: usuario.city, 
      timestamp: new Date().toISOString()
    });

    await newLog.save();

    res.status(201).json({ message: 'Log registrado com sucesso!', aula_id: aulaId });
  } catch (error) {
    console.error('Erro ao registrar log:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Extrair relatório de logs
app.get('/extrair-relatorio', async (req, res) => {
  try {
    const logs = await Log.find();

    const data = logs.map(log => {
      const horarioInicio = log.horario_inicio ? log.horario_inicio.trim() : null;
      const horarioFim = log.horario_fim ? log.horario_fim.trim() : null;

      let duracao = 'N/A';
      if (horarioInicio && horarioFim) {
        const [inicioHoras, inicioMinutos, inicioSegundos] = horarioInicio.split(':').map(Number);
        const [fimHoras, fimMinutos, fimSegundos] = horarioFim.split(':').map(Number);

        const inicio = new Date(1970, 0, 1, inicioHoras, inicioMinutos, inicioSegundos);
        const fim = new Date(1970, 0, 1, fimHoras, fimMinutos, fimSegundos);

        const diferencaMs = fim - inicio;

        if (diferencaMs >= 0) {
          const diferencaMinutos = Math.floor(diferencaMs / (1000 * 60));
          const horas = Math.floor(diferencaMinutos / 60);
          const minutos = diferencaMinutos % 60;

          duracao = `${horas}h ${minutos}m`;
        }
      }

      return {
        aula_id: log.aula_id,
        id: log.id,
        email: log.email,
        disciplina: log.disciplina,
        dia: log.dia,
        data: log.data,
        horario_inicio: log.horario_inicio,
        horario_fim: log.horario_fim,
        status: log.status,
        duracao,
      };
    });

    const workbook = xlsx.utils.book_new(); // Cria um novo workbook
    const worksheet = xlsx.utils.json_to_sheet([]); // Inicializa a worksheet

    // Adiciona o cabeçalho
    xlsx.utils.sheet_add_aoa(worksheet, [[
      'Aula ID',
      'ID',
      'Email',
      'Disciplina',
      'Dia',
      'Data',
      'Horário Início',
      'Horário Fim',
      'Status',
      'Duração',
    ]]);

    // Adiciona as linhas com os dados dos logs
    data.forEach(log => {
      xlsx.utils.sheet_add_aoa(worksheet, [[
        log.aula_id,
        log.id,
        log.email,
        log.disciplina,
        log.dia,
        log.data,
        log.horario_inicio,
        log.horario_fim,
        log.status,
        log.duracao,
      ]], { origin: -1 });
    });

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Relatório de Logs');

    const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    // Definindo cabeçalhos para download do arquivo
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_logs.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Enviando o arquivo Excel
    res.send(buffer);
  } catch (error) {
    console.error('Get relatorio error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});


app.get('/user', async (req, res) => {
  const { email } = req.query;
  console.log('Get user request received:', { email });

  try {

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado!' });
    }

    res.status(200).json({
      username: user.username,
      cargo: user.cargo,
      role: user.role,
      curso: user.curso,
      disciplinas: user.disciplinas
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

app.delete('/delete/disciplina', async (req, res) => {
  const { email, nome } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado!' });
    }

    user.disciplinas = user.disciplinas.filter(disciplina => disciplina.nome !== nome);
    await user.save();

    res.status(200).json({ message: 'Disciplina excluída com sucesso!', user });
  } catch (error) {
    console.error('Erro ao excluir disciplina:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

app.post('/add/disciplina', async (req, res) => {
  const { email, nome, dia, horarioInicio, horarioFim } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado!' });
    }

    const novaDisciplina = {
      nome,
      dia_da_semana: dia,
      horario_inicio: horarioInicio,
      horario_fim: horarioFim
    };

    user.disciplinas.push(novaDisciplina);
    await user.save();

    res.status(201).json({ message: 'Disciplina adicionada com sucesso!', user });
  } catch (error) {
    console.error('Erro ao adicionar disciplina:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});




app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
