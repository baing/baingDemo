//自定义了一个类，
export function buildClassName(obj) {
    let className = [];

    Object.keys(obj).forEach(i => {
        obj[i] && className.push(i)
    });

    return className.join(" ");
}
//目前只有2种，攻击和被攻击。
export const AttackType = {
    ATTACK: 1,
    BE_ATTACKED: 2
};