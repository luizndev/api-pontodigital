const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const xlsx = require('xlsx');
const bcrypt = require('bcrypt');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Configuração do CORS
const corsOptions = {
  origin: 'https://pontodigital-cogna.vercel.app', // Permitir apenas esse domínio
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Adicionar essa linha se você estiver enviando cookies ou credenciais
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Conexão com o MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

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

// Atualizar informações do usuário
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

// Obter disciplinas do usuário
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

          duracao = `${horas} Horas e ${minutos} Minutos`;
        } else {
          duracao = 'Horário inválido';
        }
      }

      return {
        "Nome": log.id,
        "E-mail": log.email,
        "Disciplina": log.disciplina,
        "Dia da semana": log.dia,
        "Data": log.data,
        "Inicio": log.horario_inicio || 'N/A',
        "Fim": log.horario_fim || 'N/A',
        "Status": log.status,
        "Duração (horas)": duracao
      };
    });

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(data);

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Logs');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_logs.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    res.send(buffer);
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório', error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
