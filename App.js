import React, { useState, useEffect, useRef } from "react";

import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  FlatList,
  Modal,
  TextInput,
  Animated,
  Platform,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Alert,
  ScrollView,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";

// ======================================
// CONFIGURAÇÃO DAS NOTIFICAÇÕES
// ======================================

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const STORAGE_KEY = "@autoagenda";

const RED = "#DC2626";

// ======================================
// FUNÇÕES AUXILIARES
// ======================================

function getToday() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  if (!date) return "";

  const parts = date.split("-");

  if (parts.length !== 3) return date;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getLessonDate(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const [year, month, day] = date.split("-").map(Number);

  const parsed = new Date(year, month - 1, day);

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

// ======================================
// APLICATIVO
// ======================================

export default function App() {
  const [lessons, setLessons] = useState([]);

  const [modal, setModal] = useState(false);

  const [student, setStudent] = useState("");
  const [instructor, setInstructor] = useState("");
  const [category, setCategory] = useState("B");
  const [lessonType, setLessonType] = useState("Prática");
  const [date, setDate] = useState(getToday());
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  const [filter, setFilter] = useState("Todas");
  const [loaded, setLoaded] = useState(false);

  const [toast, setToast] = useState("");

  const top = useRef(new Animated.Value(-100)).current;
  const toastAnimation = useRef(false);

  // ======================================
  // CARREGAR AGENDAMENTOS
  // ======================================

  useEffect(() => {
    async function load() {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);

        if (data) {
          const saved = JSON.parse(data);

          setLessons(
            saved.map((item) => ({
              ...item,
              status: item.status || (item.done ? "Realizada" : "Agendada"),
              student: item.student || item.title || "",
              instructor: item.instructor || "",
              category: item.category || "B",
              lessonType: item.lessonType || "Prática",
              date: item.date || getToday(),
              time: item.time || "",
              notes: item.notes || item.description || "",
              notificationId: item.notificationId || null,
              notified: item.notified || false,
            }))
          );
        }

        if (Platform.OS !== "web") {
          await Notifications.setNotificationChannelAsync(
            "autoagenda",
            {
              name: "Lembretes de aulas",
              importance: Notifications.AndroidImportance.MAX,
              sound: "default",
              vibrationPattern: [0, 250, 250, 250],
            }
          );

          const permission =
            await Notifications.getPermissionsAsync();

          if (permission.status !== "granted") {
            await Notifications.requestPermissionsAsync();
          }
        }
      } catch (error) {
        console.log("Erro ao carregar:", error);
      } finally {
        setLoaded(true);
      }
    }

    load();
  }, []);

  // ======================================
  // SALVAR AGENDAMENTOS
  // ======================================

  useEffect(() => {
    if (!loaded) return;

    async function save() {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(lessons)
        );
      } catch (error) {
        console.log("Erro ao salvar:", error);
      }
    }

    save();
  }, [lessons, loaded]);

  // ======================================
  // AVISO ANIMADO
  // ======================================

  function showToast(message) {
    if (toastAnimation.current) return;

    toastAnimation.current = true;

    setToast("🚗 Lembrete de aula: " + message);

    Animated.sequence([
      Animated.timing(top, {
        toValue: 45,
        duration: 400,
        useNativeDriver: false,
      }),

      Animated.delay(3000),

      Animated.timing(top, {
        toValue: -100,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start(() => {
      toastAnimation.current = false;
    });
  }

  // ======================================
  // LEMBRETES NA WEB
  // ======================================

  useEffect(() => {
    if (Platform.OS !== "web" || !loaded) return;

    const timer = setInterval(() => {
      const now = new Date();

      const currentDate = getToday();

      const currentTime =
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0");

      const lesson = lessons.find(
        (item) =>
          item.date === currentDate &&
          item.time === currentTime &&
          item.status === "Agendada" &&
          !item.notified
      );

      if (lesson) {
        showToast(lesson.student);

        setLessons((current) =>
          current.map((item) =>
            item.id === lesson.id
              ? { ...item, notified: true }
              : item
          )
        );
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [lessons, loaded]);

  // ======================================
  // PROGRAMAR NOTIFICAÇÃO
  // ======================================

  async function scheduleNotification(lesson) {
    if (Platform.OS === "web") return null;

    try {
      const permission =
        await Notifications.getPermissionsAsync();

      if (permission.status !== "granted") {
        return null;
      }

      const lessonDate = getLessonDate(
        lesson.date,
        lesson.time
      );

      if (lessonDate <= new Date()) {
        return null;
      }

      const notificationId =
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "🚗 Aula de direção agendada!",
            body:
              `${lesson.student} - Categoria ${lesson.category}. ` +
              `${lesson.lessonType}. Instrutor: ${lesson.instructor || "Não informado"}.`,
            sound: "default",
            data: {
              lessonId: lesson.id,
            },
          },

          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: lessonDate,
            ...(Platform.OS === "android" && {
              channelId: "autoagenda",
            }),
          },
        });

      return notificationId;
    } catch (error) {
      console.log("Erro na notificação:", error);
      return null;
    }
  }

  // ======================================
  // CANCELAR NOTIFICAÇÃO
  // ======================================

  async function cancelNotification(id) {
    if (Platform.OS === "web" || !id) return;

    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (error) {
      console.log("Erro ao cancelar:", error);
    }
  }

  // ======================================
  // LIMPAR FORMULÁRIO
  // ======================================

  function clearForm() {
    setStudent("");
    setInstructor("");
    setCategory("B");
    setLessonType("Prática");
    setDate(getToday());
    setTime("");
    setNotes("");
  }

  // ======================================
  // CADASTRAR AULA
  // ======================================

  async function addLesson() {
    if (!student.trim()) {
      Alert.alert("Atenção", "Informe o nome do aluno.");
      return;
    }

    if (!instructor.trim()) {
      Alert.alert("Atenção", "Informe o nome do instrutor.");
      return;
    }

    if (!date.trim() || !validDate(date)) {
      Alert.alert(
        "Data inválida",
        "Informe a data no formato AAAA-MM-DD."
      );
      return;
    }

    if (date < getToday()) {
      Alert.alert(
        "Data inválida",
        "Não é possível agendar uma aula para uma data passada."
      );
      return;
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timeRegex.test(time)) {
      Alert.alert(
        "Horário inválido",
        "Informe o horário no formato HH:MM. Exemplo: 14:30."
      );
      return;
    }

    const lessonDate = getLessonDate(date, time);

    if (lessonDate <= new Date()) {
      Alert.alert(
        "Horário inválido",
        "Escolha um horário futuro."
      );
      return;
    }

    const newLesson = {
      id: Date.now().toString(),
      student: student.trim(),
      instructor: instructor.trim(),
      category,
      lessonType,
      date,
      time,
      notes: notes.trim(),
      status: "Agendada",
      notified: false,
      notificationId: null,
    };

    const notificationId =
      await scheduleNotification(newLesson);

    newLesson.notificationId = notificationId;

    setLessons((current) => [
      ...current,
      newLesson,
    ]);

    clearForm();
    setModal(false);

    Alert.alert(
      "Agendamento realizado!",
      "A aula foi cadastrada com sucesso."
    );
  }

  // ======================================
  // ALTERAR STATUS
  // ======================================

  async function changeStatus(id, status) {
    const lesson = lessons.find(
      (item) => item.id === id
    );

    if (!lesson) return;

    if (status === "Realizada" || status === "Cancelada") {
      await cancelNotification(lesson.notificationId);

      setLessons((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                notificationId: null,
              }
            : item
        )
      );

      return;
    }

    if (status === "Agendada") {
      const notificationId =
        await scheduleNotification(lesson);

      setLessons((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                notified: false,
                notificationId,
              }
            : item
        )
      );
    }
  }

  // ======================================
  // EXCLUIR AULA
  // ======================================

  function removeLesson(id) {
    const lesson = lessons.find(
      (item) => item.id === id
    );

    if (!lesson) return;

    Alert.alert(
      "Excluir agendamento",
      "Deseja realmente excluir esta aula?",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await cancelNotification(lesson.notificationId);

            setLessons((current) =>
              current.filter((item) => item.id !== id)
            );
          },
        },
      ]
    );
  }

  // ======================================
  // FILTROS
  // ======================================

  const filteredLessons = lessons
    .filter((item) => {
      if (filter === "Agendadas") {
        return item.status === "Agendada";
      }

      if (filter === "Realizadas") {
        return item.status === "Realizada";
      }

      if (filter === "Canceladas") {
        return item.status === "Cancelada";
      }

      return true;
    })
    .sort((a, b) => {
      const first = `${a.date} ${a.time}`;
      const second = `${b.date} ${b.time}`;

      return first.localeCompare(second);
    });

  const scheduled = lessons.filter(
    (item) => item.status === "Agendada"
  ).length;

  const completed = lessons.filter(
    (item) => item.status === "Realizada"
  ).length;

  const canceled = lessons.filter(
    (item) => item.status === "Cancelada"
  ).length;

  // ======================================
  // COR DO STATUS
  // ======================================

  function statusColor(status) {
    if (status === "Realizada") return "#22C55E";
    if (status === "Cancelada") return "#F87171";

    return "#EF4444";
  }

  // ======================================
  // COMPONENTE DA AULA
  // ======================================

  function renderLesson({ item }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardAccent} />

        <View style={styles.lessonContent}>
          <View style={styles.lessonHeader}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>
                CATEGORIA {item.category}
              </Text>
            </View>

            <Text
              style={[
                styles.status,
                { color: statusColor(item.status) },
              ]}
            >
              {item.status.toUpperCase()}
            </Text>
          </View>

          <Text style={styles.studentName}>
            {item.student}
          </Text>

          <View style={styles.infoRow}>
            <Ionicons
              name="person-outline"
              size={15}
              color="#A1A1AA"
            />

            <Text style={styles.infoText}>
              Instrutor: {item.instructor || "Não informado"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons
              name="car-sport-outline"
              size={15}
              color="#A1A1AA"
            />

            <Text style={styles.infoText}>
              Aula {item.lessonType}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons
              name="calendar-outline"
              size={15}
              color="#EF4444"
            />

            <Text style={styles.dateText}>
              {formatDate(item.date)}
            </Text>

            <Ionicons
              name="time-outline"
              size={15}
              color="#EF4444"
            />

            <Text style={styles.dateText}>
              {item.time}
            </Text>
          </View>

          {item.notes ? (
            <Text style={styles.notes}>
              Observações: {item.notes}
            </Text>
          ) : null}

          <View style={styles.cardActions}>
            {item.status === "Agendada" && (
              <>
                <TouchableOpacity
                  style={styles.completeButton}
                  onPress={() =>
                    changeStatus(item.id, "Realizada")
                  }
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={16}
                    color="#22C55E"
                  />

                  <Text style={styles.completeText}>
                    Realizada
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() =>
                    changeStatus(item.id, "Cancelada")
                  }
                >
                  <Ionicons
                    name="close-circle-outline"
                    size={16}
                    color="#F87171"
                  />

                  <Text style={styles.cancelLessonText}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {item.status === "Cancelada" && (
              <TouchableOpacity
                style={styles.reactivateButton}
                onPress={() =>
                  changeStatus(item.id, "Agendada")
                }
              >
                <Ionicons
                  name="refresh-outline"
                  size={16}
                  color="#EF4444"
                />

                <Text style={styles.reactivateText}>
                  Reagendar
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => removeLesson(item.id)}
              style={styles.deleteButton}
            >
              <Ionicons
                name="trash-outline"
                size={19}
                color="#F87171"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ======================================
  // BOTÕES DE SELEÇÃO
  // ======================================

  function selectOption(value, current, setter) {
    return (
      <TouchableOpacity
        key={value}
        onPress={() => setter(value)}
        style={[
          styles.optionButton,
          current === value && styles.optionActive,
        ]}
      >
        <Text
          style={[
            styles.optionText,
            current === value && styles.optionTextActive,
          ]}
        >
          {value}
        </Text>
      </TouchableOpacity>
    );
  }

  // ======================================
  // TELA PRINCIPAL
  // ======================================

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor="#0B0B0D"
        barStyle="light-content"
      />

      {/* AVISO ANIMADO */}

      <Animated.View
        style={[
          styles.toast,
          { top },
        ]}
      >
        <Text style={styles.toastText}>
          {toast}
        </Text>
      </Animated.View>

      {/* CABEÇALHO */}

      <View style={styles.header}>
        <View>
          <Text style={styles.smallTitle}>
            SISTEMA DE AGENDAMENTO
          </Text>

          <Text style={styles.title}>
            Auto<Text style={{ color: RED }}>Agenda</Text>
          </Text>

          <Text style={styles.subtitle}>
            Organize suas aulas e conquiste sua CNH.
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="car-sport"
            size={34}
            color={RED}
          />
        </View>
      </View>

      {/* RESUMO */}

      <View style={styles.summary}>
        <View style={styles.summaryCard}>
          <Ionicons
            name="calendar-outline"
            size={23}
            color={RED}
          />

          <Text style={styles.summaryNumber}>
            {lessons.length}
          </Text>

          <Text style={styles.summaryLabel}>
            Total
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons
            name="time-outline"
            size={23}
            color="#F59E0B"
          />

          <Text style={styles.summaryNumber}>
            {scheduled}
          </Text>

          <Text style={styles.summaryLabel}>
            Agendadas
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons
            name="checkmark-done-outline"
            size={23}
            color="#22C55E"
          />

          <Text style={styles.summaryNumber}>
            {completed}
          </Text>

          <Text style={styles.summaryLabel}>
            Realizadas
          </Text>
        </View>
      </View>

      {/* TÍTULO DA LISTA */}

      <View style={styles.listHeader}>
        <View>
          <Text style={styles.sectionTitle}>
            Minhas aulas
          </Text>

          <Text style={styles.sectionSubtitle}>
            Gerencie seus horários e alunos.
          </Text>
        </View>

        <View style={styles.totalBadge}>
          <Text style={styles.totalBadgeText}>
            {scheduled} pendentes
          </Text>
        </View>
      </View>

      {/* FILTROS */}

      <View style={styles.filters}>
        {[
          "Todas",
          "Agendadas",
          "Realizadas",
          "Canceladas",
        ].map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setFilter(option)}
            style={[
              styles.filterButton,
              filter === option && styles.filterActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === option && styles.filterTextActive,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* LISTA */}

      {loaded ? (
        <FlatList
          data={filteredLessons}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="car-outline"
                size={58}
                color="#52525B"
              />

              <Text style={styles.empty}>
                Nenhuma aula encontrada.
              </Text>

              <Text style={styles.emptySubtitle}>
                Clique no botão vermelho para agendar uma aula.
              </Text>
            </View>
          }
          renderItem={renderLesson}
        />
      ) : (
        <Text style={styles.empty}>
          Carregando agendamentos...
        </Text>
      )}

      {/* BOTÃO FLUTUANTE */}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModal(true)}
      >
        <Ionicons
          name="add"
          size={35}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* MODAL DE CADASTRO */}

      <Modal
        visible={modal}
        animationType="slide"
        transparent
        onRequestClose={() => setModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackground}
          behavior={
            Platform.OS === "ios" ? "padding" : undefined
          }
        >
          <SafeAreaView style={styles.modal}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Nova aula
                  </Text>

                  <Text style={styles.modalSubtitle}>
                    Preencha os dados do agendamento.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setModal(false)}
                >
                  <Ionicons
                    name="close-circle"
                    size={29}
                    color="#A1A1AA"
                  />
                </TouchableOpacity>
              </View>

              {/* ALUNO */}

              <Text style={styles.label}>
                Nome do aluno *
              </Text>

              <TextInput
                placeholder="Ex: João da Silva"
                placeholderTextColor="#71717A"
                style={styles.input}
                value={student}
                onChangeText={setStudent}
              />

              {/* INSTRUTOR */}

              <Text style={styles.label}>
                Nome do instrutor *
              </Text>

              <TextInput
                placeholder="Ex: Carlos"
                placeholderTextColor="#71717A"
                style={styles.input}
                value={instructor}
                onChangeText={setInstructor}
              />

              {/* CATEGORIA */}

              <Text style={styles.label}>
                Categoria da CNH
              </Text>

              <View style={styles.optionsContainer}>
                {["A", "B", "C", "D", "E"].map((option) =>
                  selectOption(
                    option,
                    category,
                    setCategory
                  )
                )}
              </View>

              {/* TIPO DE AULA */}

              <Text style={styles.label}>
                Tipo de aula
              </Text>

              <View style={styles.optionsContainer}>
                {["Prática", "Teórica"].map((option) =>
                  selectOption(
                    option,
                    lessonType,
                    setLessonType
                  )
                )}
              </View>

              {/* DATA */}

              <Text style={styles.label}>
                Data da aula *
              </Text>

              <View style={styles.timeInputContainer}>
                <Ionicons
                  name="calendar-outline"
                  size={21}
                  color={RED}
                />

                <TextInput
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor="#71717A"
                  style={styles.timeInput}
                  value={date}
                  onChangeText={setDate}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>

              <Text style={styles.hint}>
                Exemplo: 2026-12-20.
              </Text>

              {/* HORÁRIO */}

              <Text style={styles.label}>
                Horário da aula *
              </Text>

              <View style={styles.timeInputContainer}>
                <Ionicons
                  name="alarm-outline"
                  size={22}
                  color={RED}
                />

                <TextInput
                  placeholder="14:30"
                  placeholderTextColor="#71717A"
                  style={styles.timeInput}
                  value={time}
                  onChangeText={setTime}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>

              <Text style={styles.hint}>
                Informe o horário no formato HH:MM.
              </Text>

              {/* OBSERVAÇÕES */}

              <Text style={styles.label}>
                Observações
              </Text>

              <TextInput
                placeholder="Ex: Aula de baliza, percurso urbano..."
                placeholderTextColor="#71717A"
                style={[
                  styles.input,
                  styles.descriptionInput,
                ]}
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              {/* SALVAR */}

              <TouchableOpacity
                style={styles.save}
                onPress={addLesson}
              >
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color="#FFFFFF"
                />

                <Text style={styles.saveText}>
                  Confirmar agendamento
                </Text>
              </TouchableOpacity>

              {/* CANCELAR */}

              <TouchableOpacity
                onPress={() => setModal(false)}
                style={styles.cancel}
              >
                <Text style={styles.cancelText}>
                  Voltar
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* RODAPÉ */}

      <View style={styles.footer}>
        <Ionicons
          name="car-sport-outline"
          size={16}
          color={RED}
        />

        <Text style={styles.footerText}>
          AUTOAGENDA • SUA CNH COMEÇA AQUI
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ======================================
// ESTILIZAÇÃO PRETO E VERMELHO
// ======================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0B0D",
    paddingTop: Platform.OS === "android" ? 25 : 5,
  },

  header: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  smallTitle: {
    color: "#A1A1AA",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "bold",
  },

  title: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "bold",
    marginTop: 5,
  },

  subtitle: {
    color: "#A1A1AA",
    fontSize: 11,
    marginTop: 5,
  },

  headerIcon: {
    backgroundColor: "#261012",
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  summary: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 24,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: "#19191C",
    borderWidth: 1,
    borderColor: "#29292D",
    borderRadius: 15,
    padding: 12,
    alignItems: "center",
  },

  summaryNumber: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 7,
  },

  summaryLabel: {
    color: "#A1A1AA",
    fontSize: 11,
    marginTop: 3,
  },

  listHeader: {
    paddingHorizontal: 20,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },

  sectionSubtitle: {
    color: "#A1A1AA",
    fontSize: 11,
    marginTop: 4,
  },

  totalBadge: {
    backgroundColor: "#301316",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },

  totalBadgeText: {
    color: "#F87171",
    fontSize: 10,
    fontWeight: "bold",
  },

  filters: {
    flexDirection: "row",
    paddingHorizontal: 18,
    gap: 7,
    marginBottom: 15,
    flexWrap: "wrap",
  },

  filterButton: {
    backgroundColor: "#19191C",
    borderWidth: 1,
    borderColor: "#29292D",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
  },

  filterActive: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },

  filterText: {
    color: "#A1A1AA",
    fontSize: 10,
    fontWeight: "600",
  },

  filterTextActive: {
    color: "#FFFFFF",
  },

  list: {
    paddingBottom: 120,
  },

  card: {
    backgroundColor: "#19191C",
    borderWidth: 1,
    borderColor: "#29292D",
    marginHorizontal: 15,
    marginVertical: 7,
    borderRadius: 14,
    flexDirection: "row",
    overflow: "hidden",
  },

  cardAccent: {
    width: 4,
    backgroundColor: "#DC2626",
  },

  lessonContent: {
    flex: 1,
    padding: 14,
  },

  lessonHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  categoryBadge: {
    backgroundColor: "#301316",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },

  categoryText: {
    color: "#F87171",
    fontSize: 9,
    fontWeight: "bold",
  },

  status: {
    fontSize: 9,
    fontWeight: "bold",
  },

  studentName: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 12,
    marginBottom: 8,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 6,
  },

  infoText: {
    color: "#A1A1AA",
    fontSize: 11,
  },

  dateText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    marginRight: 8,
  },

  notes: {
    color: "#A1A1AA",
    fontSize: 11,
    marginTop: 10,
    lineHeight: 17,
  },

  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#303036",
  },

  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  completeText: {
    color: "#22C55E",
    fontSize: 11,
    fontWeight: "bold",
  },

  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  cancelLessonText: {
    color: "#F87171",
    fontSize: 11,
    fontWeight: "bold",
  },

  reactivateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  reactivateText: {
    color: "#F87171",
    fontSize: 11,
    fontWeight: "bold",
  },

  deleteButton: {
    marginLeft: "auto",
    padding: 5,
  },

  emptyContainer: {
    alignItems: "center",
    marginTop: 55,
    paddingHorizontal: 20,
  },

  empty: {
    color: "#A1A1AA",
    textAlign: "center",
    marginTop: 15,
    fontSize: 15,
  },

  emptySubtitle: {
    color: "#71717A",
    fontSize: 11,
    marginTop: 7,
    textAlign: "center",
  },

  fab: {
    position: "absolute",
    right: 25,
    bottom: 65,
    width: 65,
    height: 65,
    borderRadius: 33,
    backgroundColor: "#DC2626",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#DC2626",
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },

  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: 12,
  },

  modal: {
    backgroundColor: "#19191C",
    borderWidth: 1,
    borderColor: "#333333",
    borderRadius: 20,
    padding: 20,
    maxHeight: "95%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  modalTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "bold",
  },

  modalSubtitle: {
    color: "#A1A1AA",
    fontSize: 11,
    marginTop: 5,
  },

  label: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 14,
  },

  input: {
    backgroundColor: "#252529",
    borderWidth: 1,
    borderColor: "#3A3A40",
    borderRadius: 9,
    padding: 14,
    fontSize: 14,
    color: "#FFFFFF",
  },

  descriptionInput: {
    height: 75,
    textAlignVertical: "top",
  },

  optionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  optionButton: {
    backgroundColor: "#252529",
    borderWidth: 1,
    borderColor: "#3A3A40",
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderRadius: 9,
    minWidth: 48,
    alignItems: "center",
  },

  optionActive: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },

  optionText: {
    color: "#A1A1AA",
    fontSize: 12,
    fontWeight: "bold",
  },

  optionTextActive: {
    color: "#FFFFFF",
  },

  timeInputContainer: {
    backgroundColor: "#252529",
    borderWidth: 1,
    borderColor: "#3A3A40",
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  timeInput: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    color: "#FFFFFF",
  },

  hint: {
    color: "#71717A",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 7,
  },

  save: {
    backgroundColor: "#DC2626",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 25,
  },

  saveText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "bold",
  },

  cancel: {
    backgroundColor: "#303036",
    padding: 14,
    borderRadius: 9,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
  },

  cancelText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },

  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "#DC2626",
    padding: 15,
    borderRadius: 10,
    zIndex: 999,
    elevation: 10,
  },

  toastText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "bold",
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 7,
    backgroundColor: "#19191C",
    borderTopWidth: 1,
    borderTopColor: "#29292D",
  },

  footerText: {
    color: "#A1A1AA",
    fontSize: 10,
    letterSpacing: 1,
  },
});