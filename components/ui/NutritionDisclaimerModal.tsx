import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, Linking } from 'react-native';
import { HelpCircle, X, ExternalLink } from 'lucide-react-native';

interface NutritionDisclaimerModalProps {
  buttonStyle?: any;
}

export const NutritionDisclaimerModal: React.FC<NutritionDisclaimerModalProps> = ({ buttonStyle }) => {
  const [modalVisible, setModalVisible] = useState(false);

  const openLink = (url: string) => {
    Linking.openURL(url).catch((err) => console.error("Couldn't load page", err));
  };

  return (
    <>
      <TouchableOpacity 
        style={[styles.button, buttonStyle]} 
        onPress={() => setModalVisible(true)}
      >
        <HelpCircle size={16} color="#666" style={styles.icon} />
        <Text style={styles.buttonText}>ℹ️ Referencias Nutricionales y Descargo Médico</Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Referencias y Descargo Médico</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <X size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Aviso Importante</Text>
                <Text style={styles.disclaimerText}>
                  MyCouch proporciona recomendaciones nutricionales, estimaciones calóricas y desglose de macronutrientes con fines puramente informativos y de acondicionamiento físico general. Esta aplicación no proporciona diagnóstico, tratamiento ni asesoramiento médico. Consulta siempre a un médico o nutriólogo profesional antes de iniciar cualquier programa de alimentación o cambio drástico en tu dieta.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Fuentes y Citas Nutricionales Consultadas</Text>
                
                <TouchableOpacity style={styles.linkItem} onPress={() => openLink('https://pubmed.ncbi.nlm.nih.gov/2305711/')}>
                  <View style={styles.linkTextContainer}>
                    <Text style={styles.linkTitle}>1. Ecuación de Mifflin-St Jeor & Harris-Benedict (Cálculo de Tasa Metabólica Basal - TMB)</Text>
                    <Text style={styles.linkReference}>Referencia: National Center for Biotechnology Information (NCBI) / NIH</Text>
                  </View>
                  <ExternalLink size={18} color="#007AFF" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkItem} onPress={() => openLink('https://www.who.int/news-room/fact-sheets/detail/healthy-diet')}>
                  <View style={styles.linkTextContainer}>
                    <Text style={styles.linkTitle}>2. Guías de Requerimientos Proteicos y Calóricos en Deporte</Text>
                    <Text style={styles.linkReference}>Referencia: Organización Mundial de la Salud (OMS / WHO) & FAO</Text>
                  </View>
                  <ExternalLink size={18} color="#007AFF" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkItem} onPress={() => openLink('https://fdc.nal.usda.gov/')}>
                  <View style={styles.linkTextContainer}>
                    <Text style={styles.linkTitle}>3. Base de Datos Nutricional de Alimentos</Text>
                    <Text style={styles.linkReference}>Referencia: U.S. Department of Agriculture (USDA FoodData Central)</Text>
                  </View>
                  <ExternalLink size={18} color="#007AFF" />
                </TouchableOpacity>
              </View>
              
              {/* Extra spacing at bottom for scroll */}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  icon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
    paddingTop: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  disclaimerText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#555',
    backgroundColor: '#fff3cd',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  linkTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  linkTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#222',
    marginBottom: 4,
  },
  linkReference: {
    fontSize: 12,
    color: '#777',
  }
});
