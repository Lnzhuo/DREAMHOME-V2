const COMMAND_TYPES = new Set(['place_asset', 'move_asset', 'rotate_asset', 'replace_asset', 'set_material']);

function error(errors, path, message) { errors.push({ path, message }); }
function validVec3(value) {
  return value && ['x', 'y', 'z'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]));
}

export function validateSceneCommandPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { valid: false, errors: [{ path: '$', message: 'Expected a plan object' }] };
  if (typeof plan.summary !== 'string' || !plan.summary.trim()) error(errors, 'summary', 'Required');
  if (!Array.isArray(plan.commands)) error(errors, 'commands', 'Expected an array');
  if (!Array.isArray(plan.questions)) error(errors, 'questions', 'Expected an array');
  if (!Array.isArray(plan.warnings)) error(errors, 'warnings', 'Expected an array');
  if (plan.requiresConfirmation !== true) error(errors, 'requiresConfirmation', 'Must require confirmation');
  if (Array.isArray(plan.questions) && plan.questions.some((x) => typeof x !== 'string')) error(errors, 'questions', 'Expected strings');
  if (Array.isArray(plan.warnings) && plan.warnings.some((x) => typeof x !== 'string')) error(errors, 'warnings', 'Expected strings');
  for (const [index, command] of (Array.isArray(plan.commands) ? plan.commands : []).entries()) {
    const path = `commands[${index}]`;
    if (!command || !COMMAND_TYPES.has(command.type)) {
      error(errors, `${path}.type`, 'Unsupported command');
      continue;
    }
    if (command.type === 'place_asset') {
      if (!command.assetId) error(errors, `${path}.assetId`, 'Required');
      if (!command.containerId) error(errors, `${path}.containerId`, 'Required');
      if (command.position && !validVec3(command.position)) error(errors, `${path}.position`, 'Invalid Vec3');
    }
    if (['move_asset', 'rotate_asset', 'replace_asset'].includes(command.type) && !command.placementId) {
      error(errors, `${path}.placementId`, 'Required');
    }
    if (command.type === 'set_material' && !command.targetId) error(errors, `${path}.targetId`, 'Required');
    if (command.type === 'move_asset' && !validVec3(command.position)) error(errors, `${path}.position`, 'Invalid Vec3');
    if (command.type === 'rotate_asset' && !validVec3(command.rotation)) error(errors, `${path}.rotation`, 'Invalid Vec3');
    if (command.type === 'replace_asset' && !command.newAssetId) error(errors, `${path}.newAssetId`, 'Required');
    if (command.type === 'set_material') {
      if (command.color !== undefined && !/^#[0-9a-f]{6}$/i.test(command.color)) error(errors, `${path}.color`, 'Expected #RRGGBB');
      if (command.materialId !== undefined && (typeof command.materialId !== 'string' || !command.materialId)) error(errors, `${path}.materialId`, 'Invalid material ID');
      if ((!command.color && !command.materialId) || (command.color && command.materialId)) error(errors, path, 'Provide one color or materialId');
      if (command.surface !== undefined && !['wall', 'floor'].includes(command.surface)) error(errors, `${path}.surface`, 'Expected wall or floor');
    }
  }
  return { valid: errors.length === 0, errors };
}

export class SceneCommandExecutor {
  constructor(editor) {
    this.editor = editor;
  }

  validatePlan(plan) {
    return validateSceneCommandPlan(plan);
  }

  preview(plan) {
    const validation = this.validatePlan(plan);
    const sceneDocument = this.editor.getSceneDocument();
    const errors = [...validation.errors];
    const changes = [];
    const assets = [...sceneDocument.assets, ...(this.catalog?.assets || [])];
    const materials = [...(sceneDocument.materials || []), ...(this.catalog?.materials || [])];
    if (plan.questions?.length) return { canApply: false, changes, errors, questions: plan.questions, warnings: plan.warnings || [] };
    if (!validation.valid) return { canApply: false, changes, errors, questions: [], warnings: [] };
    for (const [index, command] of (plan.commands || []).entries()) {
      const placement = command.placementId && sceneDocument.placements.find((entry) => entry.id === command.placementId);
      if (command.placementId && !placement) errors.push({ path: `commands[${index}].placementId`, message: '家具不存在' });
      if (command.type === 'place_asset' && !assets.some((entry) => entry.id === command.assetId)) {
        errors.push({ path: `commands[${index}].assetId`, message: '资产不存在' });
      }
      if (command.type === 'replace_asset' && !assets.some((entry) => entry.id === command.newAssetId)) {
        errors.push({ path: `commands[${index}].newAssetId`, message: '替换资产不存在' });
      }
      const rooms = (sceneDocument.buildings || []).flatMap((b) => (b.floors || []).flatMap((f) => f.rooms || []));
      if (command.type === 'place_asset' && !rooms.some((room) => room.id === command.containerId)) errors.push({ path: `commands[${index}].containerId`, message: '房间不存在' });
      if (command.type === 'set_material') {
        const isPlacement = sceneDocument.placements.some((p) => p.id === command.targetId);
        const isAsset = sceneDocument.assets.some((a) => a.id === command.targetId);
        const isRoom = rooms.some((room) => room.id === command.targetId);
        if (!isPlacement && !isAsset && !isRoom) errors.push({ path: `commands[${index}].targetId`, message: '目标不存在' });
        if (isRoom && (!command.materialId || !command.surface)) errors.push({ path: `commands[${index}]`, message: '房间材料需要材料 ID 和墙面或地板' });
        if (isAsset && command.materialId) errors.push({ path: `commands[${index}]`, message: '材料请指定家具实例' });
        if (command.materialId && !materials.some((m) => m.id === command.materialId)) errors.push({ path: `commands[${index}].materialId`, message: '材料不存在' });
      }
      changes.push(this.describe(command, placement, sceneDocument));
    }
    return { canApply: validation.valid && errors.length === 0 && (plan.commands || []).length > 0, changes, errors, questions: [], warnings: plan.warnings || [] };
  }

  describe(command, placement, sceneDocument) {
    const assetName = (id) => [...sceneDocument.assets, ...(this.catalog?.assets || [])].find((entry) => entry.id === id)?.name || id;
    if (command.type === 'place_asset') return `添加「${assetName(command.assetId)}」`;
    if (command.type === 'move_asset') return `移动「${assetName(placement?.assetId)}」到 (${command.position.x}, ${command.position.y}, ${command.position.z})m`;
    if (command.type === 'rotate_asset') return `旋转「${assetName(placement?.assetId)}」到 (${command.rotation.x}, ${command.rotation.y}, ${command.rotation.z})rad`;
    if (command.type === 'replace_asset') return `将「${assetName(placement?.assetId)}」替换为「${assetName(command.newAssetId)}」`;
    if (command.type === 'set_material') return `将「${assetName(command.targetId)}」${command.surface || ''}设为 ${command.materialId || command.color}`;
    return command.type;
  }

  apply(plan) {
    const preview = this.preview(plan);
    if (!preview.canApply) throw new Error(preview.questions?.[0] || preview.errors[0]?.message || '命令不可应用');
    const sceneDocument = this.editor.getSceneDocument();
    return this.editor.runWithHistory(() => {
      for (const command of plan.commands) {
        if (command.type === 'place_asset') {
          const asset = [...sceneDocument.assets, ...(this.catalog?.assets || [])].find((entry) => entry.id === command.assetId);
          this.editor.addAsset(asset, { containerId: command.containerId, position: command.position, history: false });
        }
        if (command.type === 'move_asset') this.editor.updatePlacementTransform(command.placementId, { position: command.position }, { history: false });
        if (command.type === 'rotate_asset') this.editor.updatePlacementTransform(command.placementId, { rotation: command.rotation }, { history: false });
        if (command.type === 'replace_asset') this.editor.replaceAsset(command.placementId, command.newAssetId, { history: false, asset: (this.catalog?.assets || []).find((a) => a.id === command.newAssetId) });
        if (command.type === 'set_material') {
          const placement = sceneDocument.placements.find((entry) => entry.id === command.targetId);
          const material = command.materialId && [...(sceneDocument.materials || []), ...(this.catalog?.materials || [])].find((m) => m.id === command.materialId);
          if (placement) this.editor.setPlacementAppearance(placement.id, command.color ? { color: command.color } : {}, material, { history: false });
          else if (command.surface) this.editor.setRoomMaterial(command.targetId, command.surface, material, { history: false });
          else this.editor.setAssetColor(command.targetId, command.color, { history: false });
        }
      }
      return this.editor.getSceneDocument();
    });
  }

  undo() {
    return this.editor.undo();
  }
}
