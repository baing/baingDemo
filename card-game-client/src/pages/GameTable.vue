<template>
    <div class="app">
        <div class="table">
            <!-- 为子节点提供进入、退出的动画 -->
            <transition-group 
                class="other-card-area"
                tag="div"
                :css="false"
                @enter="enter"
                @before-enter="beforeEnter"
                @after-enter="afterEnter"
            >
                <Card 
                    :key="c.k"
                    :index="index"
                    :data="c"
                    v-for="(c, index) in gameData.otherTableCard"
                />
            </transition-group >
            <transition-group 
                class="my-card-area"
                tag="div"
                :css="false"
                @enter="enter"
                @before-enter="beforeEnter"
                @after-enter="afterEnter"
            >
                <Card 
                    :key="c.k"
                    :index="index"
                    :data="c"
                    :isOut="true"
                    @onAttackStart="onAttackStart"
                    :chooseCard="chooseTableCard"
                    v-for="(c, index) in gameData.myTableCard"
                />
            </transition-group >
        </div>

        <div class="my-card">
            <Card 
                :key="c.k"
                :index="index"
                :data="c"
                :canDrag="true"
                :chooseCard="chooseHandCard"
                v-for="(c, index) in gameData.myCard"
            />
        </div>

        <div class="match-dialog-container" v-show="matchDialogShow">
            正在匹配，请等待
        </div>

        <canvas id="animationCanvas" v-show="showCanvas" :width="windowWidth" :height="windowHeight"></canvas>
    </div>
</template>

<script>
import * as io from "socket.io-client";
//导入卡片模板
import Card from "../components/Card"
//一个动画库
import Velocity from 'velocity-animate';
//攻击类型：指攻击和被攻击
import {AttackType} from "../utils"

export default {
    name: "GameTable",
    components: {Card},
    data() {
        return {
            //匹配中是否展示
            matchDialogShow: false,

            count: 0,
            //用户的唯一ID，实际上socket分配了用户的唯一ID
            userId: new Date().getTime(),
            //
            showCanvas: false,
            //默认长宽高
            windowWidth: 1920,
            windowHeight: 1080,
            //游戏里的数据，这个数据目前只有自己的手牌，需要做到双方手牌。
            gameData: {
                myCard: [], // 手牌
            },
            
            currentCardIndex: -1
        };
    },
    mounted() {
        this.socket = io.connect("http://localhost:4001");
        //在连接后就发送command事件，发送的类型为connenct，并且将userid发送到后端
        this.socket.emit("COMMAND", {
            type: "CONNECT",
            userId: this.userId
        });
        //监听waite 指匹配中
        this.socket.on("WAITE", () => {
            this.matchDialogShow = true;
        });
        //监听start 指监听游戏开始
        this.socket.on("START", result => {
            this.count = result.start;
            this.matchDialogShow = false;
            this.roomNumber = result.roomNumber;
        });
        //监听更新，更新游戏的count指数
        this.socket.on("UPDATE", args => {
            this.count = args.count;
        });
        //接受来自后端转发的attackCard事件，播放攻击动画。
        this.socket.on("ATTACK_CARD", (param) => {
            if (param.attackType === AttackType.ATTACK) {
                this.attackAnimate(param.index, param.attackIndex)
            } else {
                this.attackAnimate(param.attackIndex, param.index)
            }
        });
        //监听卡片死去的动作
        this.socket.on("DIE_CARD", (param) => {
            //isMine是否是我的牌，myKList在我的牌里的顺序，otherKList在对手牌中的顺序
            const {isMine, myKList, otherKList} = param;

            let myCardList, otherCardList;
            
            if (isMine) {
                myCardList = this.gameData.myTableCard;
                otherCardList = this.gameData.otherTableCard;
            } else {
                myCardList = this.gameData.otherTableCard;
                otherCardList = this.gameData.myTableCard;
            }
            //定时器：目前还不明白
            setTimeout(() => {
                myKList.forEach((k) => {
                    let index = myCardList.findIndex(c => c.k === k);
                    myCardList.splice(index, 1);
                });

                otherKList.forEach((k) => {
                    let index = otherCardList.findIndex(c => c.k === k);
                    otherCardList.splice(index, 1);
                })
            }, 920);
            
        });
        //监听发送卡片的动作
        this.socket.on("SEND_CARD", (param) => {
            //覆盖原对象，刷新来自服务器的数据,真的是一个好办法。
            this.gameData = Object.assign({}, this.gameData, param);
        });
        //前段注册出牌事件，进行出牌操作。
        this.socket.on("OUT_CARD", (param) => {
            const {index, card, isMine} = param;
            //己方打出卡牌
            if (isMine) {
                if (index !== -1) {
                    this.gameData.myCard.splice(index, 1);
                }

                this.gameData.myTableCard.push(card)
            //对方打出卡牌
            } else {
                this.gameData.otherTableCard.push(card)
            }
        })
        //获取当前的屏幕宽高度，在挂载时触发的函数。
        this.windowWidth = window.innerWidth;
        this.windowHeight = window.innerHeight;
        //当屏幕的宽高变化时，重新获取当前的屏幕宽高度
        window.onresize = () => {
            this.windowWidth = window.innerWidth;
            this.windowHeight = window.innerHeight;
        }
        //当卡片在场时，注册他在场时的事件，即可以攻击，可以发动效果。
        this.registerOutCardEvent();
        //故障代码，因为在data中并没有myCardAreaDom和otherCardAreaDom
        this.myCardAreaDom = document.querySelector(".my-card-area");
        this.otherCardAreaDom = document.querySelector(".other-card-area");
    },
    methods: {
        //发送add事件，似乎已经被弃用。应该没有被弃用，但是不知道什么时候添加了add事件。
        add() {
            this.socket.emit("ADD", {
                userId: this.userId
            });
        },
        //注册登场时的卡片的基本能力，例如攻击。
        registerOutCardEvent() {
            this.canvasContext = document.querySelector("#animationCanvas").getContext("2d");

            window.onmousemove = (e) => {
                if (window.isCardDrag) {
                    window.cardMoveX = e.pageX;
                    window.cardMoveY = e.pageY;
                }
                //默认代码，绘制一个攻击箭头。
                if (window.isAttackDrag) {
                    window.requestAnimationFrame(() => {
                        // 绘制攻击箭头开始
                        this.canvasContext.clearRect(0, 0, this.windowWidth, this.windowHeight);
                        this.canvasContext.strokeStyle = 'maroon';
                        this.canvasContext.fillStyle = 'maroon';


                        this.canvasContext.save();
                        this.canvasContext.setLineDash([40, 10]);
                        this.canvasContext.lineWidth = 30;

                        this.canvasContext.beginPath();
                        this.canvasContext.moveTo(this.attackStartX, this.attackStartY);
                        this.canvasContext.lineTo(e.pageX, e.pageY);
                        this.canvasContext.fill();
                        this.canvasContext.stroke();
                        this.canvasContext.restore();

                        this.canvasContext.save();
                        this.canvasContext.beginPath();
                        this.canvasContext.lineCap = 'square';
                        this.canvasContext.translate(e.pageX, e.pageY);
                        let getLineRadians = () => { // 计算直线当前的角度
                            let _a = e.pageX - this.attackStartX;
                            let _b = e.pageY - this.attackStartY;
                            let _c = Math.hypot(_a, _b);
                            return Math.acos(_a / _c) * Math.sign(_b);
                        };
                        this.canvasContext.rotate(getLineRadians() - Math.PI /2);
                        this.canvasContext.moveTo(35, -40);
                        this.canvasContext.lineTo(0, 25);
                        this.canvasContext.lineTo(-35, -40);
                        this.canvasContext.lineTo(35, -40);
                        this.canvasContext.fill();
                        this.canvasContext.stroke();
                        this.canvasContext.restore();
                        // 绘制攻击箭头结束
                    })
                }
            }

            window.onmouseup = (e) => {
                //打出拖拽
                if (window.isCardDrag && this.currentCardIndex !== -1) {
                    window.isCardDrag = false;

                    let top = this.myCardAreaDom.offsetTop,
                        width = this.myCardAreaDom.offsetWidth,
                        left = this.myCardAreaDom.offsetLeft,
                        height = this.myCardAreaDom.offsetHeight;

                    let x = e.pageX,
                        y = e.pageY;

                    if (x > left && x < (left + width) && y > top && y < (top + height)) {
                        //发送游戏数据，类型为打出一张卡片
                        this.socket.emit("COMMAND", {
                            type: "OUT_CARD",
                            r: this.roomNumber,
                            index: this.currentCardIndex
                        })
                    }
                }
                //攻击拖拽
                if (window.isAttackDrag) {
                    window.isAttackDrag = false;
                    this.showCanvas = false;
                    this.canvasContext.clearRect(0, 0, this.windowWidth, this.windowHeight);

                    let x = e.pageX, // 鼠标松开的x
                        y = e.pageY, // 鼠标松开的y
                        k = -1; // 用于记录找到的卡牌的index

                    this.otherCardAreaDom.childNodes.forEach(cd => { // 循环遍历对手的卡牌dom
                        let top = cd.offsetTop,
                            width = cd.offsetWidth,
                            left = cd.offsetLeft,
                            height = cd.offsetHeight;

                        if (x > left && x < (left + width) && y > top && y < (top + height)) { // 边缘检测
                            k = cd.dataset.k;

                            this.attackCard(k);
                        }
                    });
                }
            }
        },
        //当攻击开始时，在鼠标点下后就触发
        onAttackStart({startX, startY}) {
            this.showCanvas = true;
            window.isAttackDrag = true;
            this.attackStartX = startX;
            this.attackStartY = startY;
        },
        //发送攻击事件给后端。
        attackCard(k) {
            this.socket.emit("COMMAND", {
                type: "ATTACK_CARD",
                r: this.roomNumber,
                myK: this.currentTableCardK,
                attackK: k
            })
        },
        //攻击动画效果
        attackAnimate(from, to) {
            let myDom = this.myCardAreaDom.childNodes[from];
            let otherDom = this.otherCardAreaDom.childNodes[to];

            let h = otherDom.offsetLeft - myDom.offsetLeft;
            let v = otherDom.offsetTop + otherDom.offsetHeight - myDom.offsetTop - myDom.parentElement.offsetTop;

            Velocity(myDom, { translateX: h, translateY: v }, {
                easing: 'ease-in',
                duration: 200,
                begin: () => {
                    myDom.style['transition'] = 'all 0s';
                }
            }).then(el => {
                return Velocity(el, { translateX: 0, translateY: 0 }, {
                    easing: 'ease-out',
                    duration: 300,
                    complete: () => {
                        myDom.style['transition'] = 'all 0.2s';
                    }
                })
            })
        },
        //选择桌上的牌
        chooseTableCard(index) {
            this.currentTableCardK = this.gameData.myTableCard[index].k; 
        },
        //选择手上的牌
        chooseHandCard(index) {
            this.currentCardIndex = index;
        },
        //在el元素进入前
        beforeEnter(el) {
            el.style['transition'] = "all 0s";
            el.style.opacity = 0
        },
        //在el元素进入时的动画
        enter(el, done) {
            Velocity(el, {scale: 1.3}, {duration: 10})
                .then(el => {
                    return Velocity(el, {opacity: 1}, {duration: 300})
                })
                .then(el => {
                    return Velocity(el, {scale: 1}, {duration: 200, complete() {done()}})
                })
        },
        //在el元素进入后的动画
        afterEnter(el) {
            el.style['transition'] = "all 0.2s";
            el.style.opacity = 1;
            el.style.transform = '';
        }
    }
};
</script>

<style scoped>
    .app {
        width: 100%;
        height: 100%;
        overflow: hidden;
        user-select: none;
    }

    .my-card {
        position: absolute;
        bottom: 20px;
        width: 100%;
        min-height: 170px;
        display: flex;
        justify-content: center;
        background: #f00;
    }

    .table {
        width: 100%;
        height: 100%;
    }

    .my-card-area {
        width: 100%;
        height: 33%;
        min-height: 170px;
        position: absolute;
        bottom: 210px;
        display: flex;
        padding: 10px;
        box-sizing: border-box;
        justify-content: center;
        background-color: #0f0;
    }

    .other-card-area {
        width: 100%;
        min-height: 170px;
        display: flex;
        padding: 10px;
        justify-content: center;
        box-sizing: border-box;
        flex-wrap: wrap;
        background-color: #00f;
    }

    .match-dialog-container {
        position: absolute;
        width: 100%;
        height: 100%;
        left: 0;
        top: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 20px;
        background: rgba(0, 0, 0, 0.5);
        color: white;
    }

    #animationCanvas {
        width: 100%;
        height: 100%;
        position: absolute;
        left: 0;
        top: 0;
        z-index: 999;
    }
</style>
